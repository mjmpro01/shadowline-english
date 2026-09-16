"""The Python worker must score a take exactly as the browser did.

This is the test that makes the migration safe. Without it, a take scored 82 in
the browser and 74 here would leave a learner's history quietly incomparable,
and nothing on screen would say the measuring stick had changed.

The fixtures are WAVs plus the scores ``app/src/lib/dsp/`` produced for them.
Parity alone would pass if both implementations were wrong in the same way, so
``test_properties.py`` asserts the behaviour matters on its own terms.
"""

import pytest

from shadowline.compare import compare_contours
from shadowline.pitch import track_pitch
from tests.conftest import read_case

METRICS = ("Intonation", "Rhythm", "Stress", "Variation")


def score_case(name: str):
    reference, take, rate = read_case(name)
    result = compare_contours(track_pitch(reference, rate), track_pitch(take, rate))
    assert result is not None, f"{name} produced no comparison"
    return result


def case_names(expected) -> list[str]:
    return [c["name"] for c in expected["cases"]]


def test_every_fixture_is_covered(expected):
    assert len(expected["cases"]) >= 9, "the fixture set has shrunk"


def test_overall_score_matches_the_browser(expected):
    for case in expected["cases"]:
        result = score_case(case["name"])
        assert result.score == case["score"], (
            f"{case['name']}: python scored {result.score}, "
            f"the browser scored {case['score']}"
        )


@pytest.mark.parametrize("metric", METRICS)
def test_each_metric_matches_the_browser(expected, metric):
    for case in expected["cases"]:
        result = score_case(case["name"])
        assert result.scores[metric] == case["scores"][metric], (
            f"{case['name']} {metric}: python {result.scores[metric]}, "
            f"browser {case['scores'][metric]}"
        )


def test_the_pitch_tracker_finds_the_same_voiced_frames(expected):
    """Narrows a parity failure to the tracker rather than the scoring."""
    for case in expected["cases"]:
        reference, take, rate = read_case(case["name"])
        assert track_pitch(reference, rate).voiced_frames == case["referenceVoicedFrames"]
        assert track_pitch(take, rate).voiced_frames == case["takeVoicedFrames"]


def test_the_pitch_tracker_finds_the_same_register(expected):
    """Median F0 to a hundredth of a hertz.

    Not exact: the fixtures were scored on float samples and are stored as
    16-bit WAV, so the worker reads a quantised copy. That quantisation is
    -96dB and moves the median by well under a cent.
    """
    for case in expected["cases"]:
        reference, take, rate = read_case(case["name"])
        assert track_pitch(reference, rate).median_hz == pytest.approx(
            case["referenceMedianHz"], abs=0.01
        )
        assert track_pitch(take, rate).median_hz == pytest.approx(
            case["takeMedianHz"], abs=0.01
        )


def test_mean_deviation_matches(expected):
    for case in expected["cases"]:
        result = score_case(case["name"])
        assert result.mean_deviation == pytest.approx(case["meanDeviation"], abs=0.01)
