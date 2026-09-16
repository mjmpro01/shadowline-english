"""Turning whatever the browser recorded into samples the tracker can read.

Takes arrive as WebM/Opus from MediaRecorder and clips as WAV from the studio,
so the worker does not get to assume a format. ffmpeg handles both and does the
resampling to :data:`ANALYSIS_RATE` in the same pass, which is also what the
browser's OfflineAudioContext was doing.
"""

from __future__ import annotations

import subprocess

import numpy as np

from .pitch import ANALYSIS_RATE


class DecodeError(RuntimeError):
    """The bytes were not audio this worker can read."""


# A six-second clip at 8kHz is 48k samples. The cap is generous enough for a
# studio upload of a whole recording and small enough that a malformed file
# cannot exhaust memory.
MAX_SECONDS = 600


def decode_to_mono(data: bytes, rate: int = ANALYSIS_RATE) -> np.ndarray:
    """Mono float32 samples at ``rate``.

    ``-f f32le`` asks ffmpeg for exactly the layout numpy wants, so there is no
    conversion here to get subtly wrong.
    """
    if not data:
        raise DecodeError("no audio bytes")

    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "error",
        "-nostdin",
        "-i", "pipe:0",
        "-vn",
        "-map", "a:0",
        "-ac", "1",
        "-ar", str(rate),
        "-t", str(MAX_SECONDS),
        "-f", "f32le",
        "pipe:1",
    ]
    try:
        result = subprocess.run(command, input=data, capture_output=True, timeout=120)
    except FileNotFoundError as err:
        raise DecodeError("ffmpeg is not installed") from err
    except subprocess.TimeoutExpired as err:
        raise DecodeError("decoding timed out") from err

    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", "replace").strip().splitlines()
        raise DecodeError(detail[-1] if detail else "ffmpeg failed")

    samples = np.frombuffer(result.stdout, dtype="<f4")
    if samples.size == 0:
        raise DecodeError("decoded to no audio")
    # frombuffer gives a read-only view over the subprocess output; the tracker
    # writes into its octave-smoothed copy, so hand it something writeable.
    return np.array(samples, dtype=np.float32)
