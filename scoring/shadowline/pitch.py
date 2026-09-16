"""Pitch tracking for recorded speech.

A port of ``app/src/lib/dsp/pitch.ts``, deliberately faithful rather than
improved. Praat's autocorrelation tracker would be a better pitch detector, but
it is a *different* one: every score already in a learner's history would shift,
and nothing on screen would say why. Keeping the algorithm means the scores this
worker produces are the scores the browser produced.

YIN (de Cheveigné & Kawahara 2002): difference function, cumulative mean
normalised difference, absolute threshold, then parabolic interpolation of the
chosen lag. Frames are 40ms every 10ms.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

FRAME_MS = 40
HOP_MS = 10
# Speech F0 tops out around 400Hz, so analysing at 8kHz keeps every harmonic
# that matters and costs a quarter of what 16kHz does in the difference loop.
ANALYSIS_RATE = 8000
F0_MIN = 60
F0_MAX = 400
YIN_THRESHOLD = 0.15
# Below this frame RMS there is no speech to measure.
SILENCE_RMS = 0.006


@dataclass
class Contour:
    """Voiced frames, the speaker's own register, and how long they spoke."""

    times: np.ndarray  # float64, seconds from the start
    hz: np.ndarray  # float64, NaN where unvoiced or silent
    rms: np.ndarray  # float64
    median_hz: float
    duration: float

    @property
    def voiced_frames(self) -> int:
        return int(np.count_nonzero(~np.isnan(self.hz)))


def _frames(samples: np.ndarray, frame_length: int, hop: int) -> np.ndarray:
    """Overlapping frames as a view, so a long clip is not copied per frame."""
    count = 1 + (len(samples) - frame_length) // hop if len(samples) >= frame_length else 0
    if count <= 0:
        return np.empty((0, frame_length), dtype=samples.dtype)
    stride = samples.strides[0]
    return np.lib.stride_tricks.as_strided(
        samples, shape=(count, frame_length), strides=(hop * stride, stride), writeable=False
    )


def _difference(frames: np.ndarray, max_lag: int) -> np.ndarray:
    """YIN's difference function for every frame at once.

    Stored as float32 because the TypeScript original stores it in a
    Float32Array; the accumulation happens in float64 there too, so the
    rounding lands in the same place.
    """
    diff = np.zeros((frames.shape[0], max_lag + 1), dtype=np.float32)
    n = frames.shape[1]
    wide = frames.astype(np.float64)
    for lag in range(1, max_lag + 1):
        d = wide[:, : n - lag] - wide[:, lag:]
        diff[:, lag] = np.sum(d * d, axis=1)
    return diff


def _cmnd(diff: np.ndarray) -> np.ndarray:
    """Cumulative mean normalised difference: makes the threshold scale-free."""
    max_lag = diff.shape[1] - 1
    cmnd = np.ones_like(diff)
    lags = np.arange(1, max_lag + 1, dtype=np.float64)
    running = np.cumsum(diff[:, 1:].astype(np.float64), axis=1)
    with np.errstate(divide="ignore", invalid="ignore"):
        values = diff[:, 1:].astype(np.float64) * lags / running
    cmnd[:, 1:] = np.where(running == 0, 1.0, values).astype(np.float32)
    return cmnd


def _pick_lag(cmnd_row: np.ndarray, min_lag: int, max_lag: int) -> float | None:
    """The chosen lag for one frame, interpolated to sub-sample accuracy."""
    chosen = -1
    lag = min_lag
    while lag <= max_lag:
        if cmnd_row[lag] < YIN_THRESHOLD:
            # Walk to the local minimum of this dip rather than taking its edge.
            while lag + 1 <= max_lag and cmnd_row[lag + 1] < cmnd_row[lag]:
                lag += 1
            chosen = lag
            break
        lag += 1

    if chosen == -1:
        best = min_lag + int(np.argmin(cmnd_row[min_lag : max_lag + 1]))
        if cmnd_row[best] > 0.35:
            return None
        chosen = best

    prev = cmnd_row[chosen - 1] if chosen - 1 >= 0 else cmnd_row[chosen]
    nxt = cmnd_row[chosen + 1] if chosen + 1 < len(cmnd_row) else cmnd_row[chosen]
    denom = 2 * (2 * cmnd_row[chosen] - prev - nxt)
    shift = 0.0 if denom == 0 else (nxt - prev) / denom
    return float(chosen + shift)


def track_pitch(samples: np.ndarray, sample_rate: int) -> Contour:
    samples = np.asarray(samples, dtype=np.float32)
    frame_length = round(FRAME_MS / 1000 * sample_rate)
    hop = round(HOP_MS / 1000 * sample_rate)

    frames = _frames(samples, frame_length, hop)
    if frames.shape[0] == 0:
        return Contour(
            np.empty(0), np.empty(0), np.empty(0), 0.0, len(samples) / sample_rate
        )

    times = np.arange(frames.shape[0], dtype=np.float64) * hop / sample_rate
    energy = np.sum(frames.astype(np.float64) ** 2, axis=1)
    rms = np.sqrt(energy / frame_length)

    max_lag = min(sample_rate // F0_MIN, frame_length // 2)
    min_lag = max(2, sample_rate // F0_MAX)

    hz = np.full(frames.shape[0], np.nan)
    if max_lag > min_lag:
        loud = rms >= SILENCE_RMS
        if np.any(loud):
            cmnd = _cmnd(_difference(frames[loud], max_lag))
            picked = np.full(cmnd.shape[0], np.nan)
            for i in range(cmnd.shape[0]):
                lag = _pick_lag(cmnd[i], min_lag, max_lag)
                if lag is not None and lag > 0:
                    candidate = sample_rate / lag
                    if F0_MIN <= candidate <= F0_MAX:
                        picked[i] = candidate
            hz[loud] = picked

    _smooth_octave_jumps(hz)

    voiced = hz[~np.isnan(hz)]
    median_hz = float(_median(voiced)) if voiced.size else 0.0
    return Contour(times, hz, rms, median_hz, len(samples) / sample_rate)


def _median(values: np.ndarray) -> float:
    """numpy's median, but matching the original's even-length averaging."""
    if values.size == 0:
        return 0.0
    return float(np.median(values))


def _smooth_octave_jumps(hz: np.ndarray) -> None:
    """YIN occasionally locks onto a harmonic; snap lone frames back.

    Written in place and left to right, exactly as the original loop runs, so a
    correction feeds into the next frame's neighbours the same way.
    """
    for i in range(1, len(hz) - 1):
        value, before, after = hz[i], hz[i - 1], hz[i + 1]
        if np.isnan(value) or np.isnan(before) or np.isnan(after):
            continue
        neighbour = (before + after) / 2
        for factor in (2.0, 0.5):
            if abs(value * factor - neighbour) < abs(value - neighbour) * 0.5:
                hz[i] = value * factor
                break


def to_semitones(hz: float | np.ndarray, reference_hz: float) -> float | np.ndarray:
    return 12 * np.log2(hz / reference_hz)


@dataclass
class Track:
    """Voiced frames as semitones around the speaker's own median."""

    time: np.ndarray
    semitone: np.ndarray
    rms: np.ndarray

    def __len__(self) -> int:
        return len(self.time)


def semitone_track(contour: Contour) -> Track:
    if not contour.median_hz:
        return Track(np.empty(0), np.empty(0), np.empty(0))
    voiced = ~np.isnan(contour.hz)
    return Track(
        contour.times[voiced],
        to_semitones(contour.hz[voiced], contour.median_hz),
        contour.rms[voiced],
    )
