"""Decoding, checked against known audio rather than against itself.

The worker's other tests compare two recordings, so a decoder fault that hits
both — the wrong sample rate, the wrong channel count — cancels out and the
score still reads 100. These assert the absolute answer instead.
"""

import subprocess
from pathlib import Path

import numpy as np
import pytest

from shadowline.audio import MAX_SECONDS, DecodeError, decode_to_mono
from shadowline.pitch import ANALYSIS_RATE, track_pitch

FIXTURES = Path(__file__).parent / "fixtures"


def test_a_known_wav_decodes_to_the_expected_length_and_rate():
    """The fixture is 2.4 seconds; at 8kHz that is 19200 samples, and nothing
    else. A stereo or 16kHz decode lands here first."""
    samples = decode_to_mono(FIXTURES.joinpath("identical.reference.wav").read_bytes())
    assert samples.ndim == 1
    assert samples.dtype == np.float32
    assert len(samples) == pytest.approx(2.4 * ANALYSIS_RATE, abs=ANALYSIS_RATE // 100)


def test_a_known_tone_keeps_its_pitch_through_decoding():
    """The fixture is built around 200Hz. If the decoder hands back the wrong
    rate, the tracker reads an octave out and this is what says so."""
    samples = decode_to_mono(FIXTURES.joinpath("identical.reference.wav").read_bytes())
    contour = track_pitch(samples, ANALYSIS_RATE)
    assert contour.median_hz == pytest.approx(200.0, abs=1.0)
    assert contour.duration == pytest.approx(2.4, abs=0.02)


def test_opus_keeps_the_pitch_and_the_length():
    """What MediaRecorder actually sends."""
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        webm = Path(tmp) / "take.webm"
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error",
             "-i", str(FIXTURES / "identical.reference.wav"),
             "-c:a", "libopus", "-b:a", "64k", "-f", "webm", str(webm), "-y"],
            check=True,
        )
        contour = track_pitch(decode_to_mono(webm.read_bytes()), ANALYSIS_RATE)

    assert contour.median_hz == pytest.approx(200.0, abs=1.0)
    assert contour.duration == pytest.approx(2.4, abs=0.05)


def test_a_stereo_source_is_mixed_down_not_interleaved():
    """Reading interleaved stereo as mono doubles the length and halves every
    apparent frequency, which reads as a plausible contour rather than an error."""
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        stereo = Path(tmp) / "stereo.wav"
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error",
             "-i", str(FIXTURES / "identical.reference.wav"),
             "-ac", "2", "-ar", "44100", str(stereo), "-y"],
            check=True,
        )
        samples = decode_to_mono(stereo.read_bytes())

    assert len(samples) == pytest.approx(2.4 * ANALYSIS_RATE, abs=ANALYSIS_RATE // 100)
    assert track_pitch(samples, ANALYSIS_RATE).median_hz == pytest.approx(200.0, abs=1.0)


def test_bytes_that_are_not_audio_are_refused():
    with pytest.raises(DecodeError):
        decode_to_mono(b"this is not a recording")
    with pytest.raises(DecodeError):
        decode_to_mono(b"")


def test_the_decoder_has_a_length_cap():
    """A malformed or hostile file must not be able to exhaust memory."""
    assert MAX_SECONDS <= 600
