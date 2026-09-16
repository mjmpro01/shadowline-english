"""What the scores are supposed to mean.

These mirror ``app/test/compare.test.ts``. They exist because the parity tests
would pass just as happily if both implementations were broken together: these
say what a good score and a bad one are, independently of any recorded number.
"""

import pytest

from shadowline.compare import compare_contours, pitch_range
from shadowline.pitch import semitone_track, track_pitch
from tests.conftest import read_case


def compare(name: str):
    reference, take, rate = read_case(name)
    return compare_contours(track_pitch(reference, rate), track_pitch(take, rate))


def test_an_identical_delivery_scores_full_marks():
    result = compare("identical")
    assert result.score == 100
    assert result.mean_deviation < 0.1


def test_vocal_register_is_ignored():
    """The same melody an octave down is the same delivery."""
    result = compare("octave-down")
    assert result.scores["Intonation"] > 95
    assert result.score > 95


def test_a_monotone_reading_of_a_melodic_line_is_marked_down():
    """Time warping must not let a flat contour hide.

    Intonation is measured on time-normalised shape for exactly this reason: on
    the warped alignment, every flat frame can be matched to whichever reference
    frame happens to sit at the same pitch, and a monotone reading scores well.
    """
    result = compare("monotone")
    assert result.scores["Intonation"] < 75
    assert result.scores["Variation"] < 10
    assert result.score < 60


def test_variation_tracks_how_much_of_the_range_the_voice_covers():
    result = compare("narrow-range")
    assert 15 < result.scores["Variation"] < 40


def test_a_slow_take_keeps_its_melody_but_loses_tempo():
    result = compare("slow")
    assert result.scores["Intonation"] > 90
    assert result.scores["Rhythm"] < 95


def test_a_rising_line_is_not_a_rise_and_fall_line():
    result = compare("rising")
    assert result.scores["Intonation"] < 70


def test_silence_produces_no_comparison():
    """A take with nothing voiced in it gets no score, rather than a bad one."""
    import numpy as np

    reference, _, rate = read_case("identical")
    silence = np.zeros(int(rate * 2.4), dtype=np.float32)
    assert compare_contours(track_pitch(reference, rate), track_pitch(silence, rate)) is None


def test_pitch_range_measures_the_spread_in_semitones():
    _, wide_take, rate = read_case("identical")
    _, narrow_take, _ = read_case("narrow-range")
    wide = pitch_range(semitone_track(track_pitch(wide_take, rate)))
    narrow = pitch_range(semitone_track(track_pitch(narrow_take, rate)))
    assert wide > narrow * 2


def test_scores_are_whole_numbers_in_range():
    for name in ("identical", "monotone", "slow", "rising", "quiet"):
        result = compare(name)
        for metric, value in result.scores.items():
            assert isinstance(value, int), f"{name} {metric} is {type(value)}"
            assert 0 <= value <= 100, f"{name} {metric} is {value}"
        assert 0 <= result.score <= 100


@pytest.mark.parametrize("value,want", [(83.5, 84), (82.5, 83), (-4.0, 0), (140.0, 100)])
def test_rounding_matches_javascript(value, want):
    """Math.round rounds half up; Python's round breaks ties to even.

    82.5 would be 83 in the browser and 82 here, which is a visible point of
    difference at exactly the values a learner sees repeatedly.
    """
    from shadowline.compare import _clamp_score

    assert _clamp_score(value) == want


def test_octave_smoothing_snaps_a_lone_harmonic_back():
    """YIN sometimes locks onto a harmonic for a single frame.

    Driven directly rather than through a fixture: the synthesised tones are
    clean enough that the tracker never actually slips on them, so nothing else
    in this suite would notice if the correction were deleted.
    """
    import numpy as np

    from shadowline.pitch import _smooth_octave_jumps

    hz = np.array([200.0, 400.0, 200.0])  # the middle frame is an octave high
    _smooth_octave_jumps(hz)
    assert hz[1] == pytest.approx(200.0)

    hz = np.array([200.0, 100.0, 200.0])  # and an octave low
    _smooth_octave_jumps(hz)
    assert hz[1] == pytest.approx(200.0)


def test_octave_smoothing_leaves_a_real_movement_alone():
    """A genuine step must survive, or every rising line would be flattened."""
    import numpy as np

    from shadowline.pitch import _smooth_octave_jumps

    hz = np.array([200.0, 212.0, 224.0])
    _smooth_octave_jumps(hz)
    assert hz[1] == pytest.approx(212.0)


def test_a_noisy_take_is_still_recognised_as_the_same_delivery():
    """Noise shallows the cumulative-mean dips, which is where the YIN
    threshold earns its value; a clean tone never tests it.

    The same melody under room-level noise loses accuracy but stays recognisably
    the same delivery — Variation, which reads the overall spread, barely moves.
    """
    result = compare("noisy")
    assert result.scores["Variation"] > 90
    assert result.scores["Intonation"] > 40
    assert result.score > 60


def test_heavy_noise_degrades_the_measurement_rather_than_faking_one():
    """At high noise the tracker loses most of its voiced frames.

    Worth stating rather than leaving implicit: the score that comes back is
    low, not wrong — a learner recording in a loud room is marked down for a
    recording the app genuinely cannot measure, and that is a limitation of the
    pitch tracker, not of their delivery.
    """
    clean = compare("identical")
    noisy = compare("very-noisy")
    assert clean.score > 90
    assert noisy.score < 50
