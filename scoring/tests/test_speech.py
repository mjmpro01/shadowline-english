"""A take with nobody speaking in it is not scored, whatever the room sounds like.

The recordings here are what a quiet room gives a microphone with automatic
gain: a steady hum or fan tone the pitch tracker follows as if it were a voice,
or a few clicks and a breath. Every one of them used to come back with a score.
"""

from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from shadowline.compare import compare_contours
from shadowline.pitch import ANALYSIS_RATE, track_pitch
from shadowline.speech import missing_speech

FIXTURES = Path(__file__).parent / "fixtures"


def contour_of(name: str):
    samples, rate = sf.read(FIXTURES / name, dtype="float32")
    assert rate == ANALYSIS_RATE
    return track_pitch(samples, ANALYSIS_RATE)


REFERENCE = "identical.reference.wav"
SECONDS = 2.4


def room(seed: int = 1) -> tuple[np.ndarray, np.random.Generator]:
    rng = np.random.default_rng(seed)
    t = np.arange(int(SECONDS * ANALYSIS_RATE)) / ANALYSIS_RATE
    return t, rng


def hum() -> np.ndarray:
    """Mains hum at its 100Hz harmonic, over a little hiss."""
    t, rng = room()
    tone = np.sin(2 * np.pi * 100 * t) + 0.5 * np.sin(2 * np.pi * 200 * t)
    return (tone * 0.01 + rng.standard_normal(t.size) * 0.003).astype(np.float32)


def fan() -> np.ndarray:
    """A fan's tone, drifting a little as fans do."""
    t, rng = room(2)
    tone = np.sin(2 * np.pi * (180 + 3 * np.sin(2 * np.pi * 0.7 * t)) * t)
    return (tone * 0.02 + rng.standard_normal(t.size) * 0.004).astype(np.float32)


def one_word() -> np.ndarray:
    """Near silence and a single short voiced sound: a cough, an 'uh'."""
    t, rng = room(3)
    x = rng.standard_normal(t.size) * 0.001
    burst = (t > 1.0) & (t < 1.2)
    x[burst] += np.sin(2 * np.pi * 140 * t[burst]) * 0.1
    return x.astype(np.float32)


@pytest.mark.parametrize("sound", [hum, fan, one_word], ids=["hum", "fan", "one-word"])
def test_a_take_with_no_one_speaking_has_no_speech(sound):
    reference = contour_of(REFERENCE)
    take = track_pitch(sound(), ANALYSIS_RATE)
    why = missing_speech(take, reference)
    assert why is not None
    # The screens recognise the reason by how it starts.
    assert why.startswith("no speech found")


def test_without_the_check_the_hum_and_the_fan_would_have_scored():
    """What the check is for: the comparison alone scores a steady tone."""
    reference = contour_of(REFERENCE)
    for sound in (hum, fan):
        comparison = compare_contours(reference, track_pitch(sound(), ANALYSIS_RATE))
        assert comparison is not None and comparison.score >= 40


@pytest.mark.parametrize(
    "take",
    sorted(path.name for path in FIXTURES.glob("*.take.wav")),
)
def test_every_spoken_fixture_still_counts_as_speech(take):
    """Quiet, noisy, monotone, slow: a voice in any of them is still a voice."""
    reference = contour_of(take.replace(".take.", ".reference."))
    assert missing_speech(contour_of(take), reference) is None
