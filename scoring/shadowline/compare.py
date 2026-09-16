"""Scoring a take against a clip's reference contour.

A port of ``app/src/lib/dsp/compare.ts``. Both tracks arrive already expressed in
semitones around each speaker's own median, so a low voice shadowing a high one
is not penalised for register — only for the shape, timing, emphasis and range of
the delivery.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .pitch import Contour, Track, semitone_track

# Frames of local drift the band allows — 3 seconds at a 10ms hop.
MAX_BAND = 300
SHAPE_POINTS = 200
METRIC_NAMES = ("Intonation", "Rhythm", "Stress", "Variation")


@dataclass
class Comparison:
    score: int
    scores: dict[str, int]
    # Mean absolute pitch distance after alignment, in semitones.
    mean_deviation: float
    reference: Track
    user: Track
    path: np.ndarray  # (k, 2) of aligned index pairs


def _percentile(sorted_values: np.ndarray, p: float) -> float:
    if sorted_values.size == 0:
        return 0.0
    idx = (sorted_values.size - 1) * p
    lo, hi = int(np.floor(idx)), int(np.ceil(idx))
    if lo == hi:
        return float(sorted_values[lo])
    return float(sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (idx - lo))


def pitch_range(track: Track) -> float:
    """10th–90th percentile spread: how much the voice moves, ignoring outliers."""
    sorted_values = np.sort(track.semitone)
    return _percentile(sorted_values, 0.9) - _percentile(sorted_values, 0.1)


def _clamp_score(value: float) -> int:
    """Round half away from zero, as JavaScript's Math.round does.

    Python's round() breaks ties to even, so 83.5 would come out 84 in the
    browser and 84 here only by luck. Getting this wrong shifts scores by a
    point at exactly the values a learner is most likely to see twice.
    """
    rounded = float(np.floor(value + 0.5))
    return int(max(0.0, min(100.0, rounded)))


def _resample(track: Track, count: int) -> np.ndarray:
    """Both contours on a shared 0..1 time axis.

    Intonation is judged here rather than on the warped alignment: time warping
    lets a monotone delivery hide, because every flat frame can be matched to
    whichever reference frame happens to sit at the same pitch.
    """
    first = track.time[0]
    span = track.time[-1] - first
    if span == 0:
        span = 1
    out = np.empty(count)
    cursor = 0
    n = len(track)
    for i in range(count):
        target = first + (i / (count - 1)) * span
        while cursor < n - 2 and track.time[cursor + 1] < target:
            cursor += 1
        a_time, a_semi = track.time[cursor], track.semitone[cursor]
        if cursor + 1 < n:
            b_time, b_semi = track.time[cursor + 1], track.semitone[cursor + 1]
        else:
            b_time, b_semi = a_time, a_semi
        gap = b_time - a_time
        ratio = 0.0 if gap <= 0 else (target - a_time) / gap
        out[i] = a_semi + (b_semi - a_semi) * min(max(ratio, 0.0), 1.0)
    return out


def _dtw(a: np.ndarray, b: np.ndarray, band_ratio: float = 0.35) -> np.ndarray:
    """Dynamic time warping constrained to a Sakoe-Chiba band.

    The band is centred on the diagonal between the two lengths, so an overall
    difference in tempo is already accounted for and the width only has to cover
    local drift. Only the band is stored: a full n*m matrix reaches hundreds of
    megabytes on a long clip, nearly all of it cells the band never visits.
    """
    n, m = len(a), len(b)
    band = min(MAX_BAND, max(8, round(max(n, m) * band_ratio)))

    lo = np.zeros(n + 1, dtype=np.int64)
    hi = np.zeros(n + 1, dtype=np.int64)
    for i in range(1, n + 1):
        centre = round((i - 1) * m / n) + 1
        lo[i] = max(1, centre - band)
        hi[i] = min(m, centre + band)

    width = 2 * band + 2
    cost = np.full((n + 1) * width, np.inf)

    def get(i: int, j: int) -> float:
        if i < 0 or j < lo[i] or j > hi[i]:
            return np.inf
        return cost[i * width + (j - lo[i])]

    cost[0] = 0.0
    for i in range(1, n + 1):
        row_lo, row_hi = int(lo[i]), int(hi[i])
        for j in range(row_lo, row_hi + 1):
            local = abs(a[i - 1] - b[j - 1])
            cost[i * width + (j - row_lo)] = local + min(
                get(i - 1, j), get(i, j - 1), get(i - 1, j - 1)
            )

    path = []
    i, j = n, m
    while i > 0 and j > 0:
        path.append((i - 1, j - 1))
        diag, up, left = get(i - 1, j - 1), get(i - 1, j), get(i, j - 1)
        if diag <= up and diag <= left:
            i -= 1
            j -= 1
        elif up <= left:
            i -= 1
        else:
            j -= 1
    path.reverse()
    return np.array(path, dtype=np.int64)


def _pearson(xs: np.ndarray, ys: np.ndarray) -> float:
    n = min(len(xs), len(ys))
    if n < 2:
        return 0.0
    a = xs[:n] - xs[:n].mean()
    b = ys[:n] - ys[:n].mean()
    denom = np.sqrt(np.sum(a * a) * np.sum(b * b))
    return 0.0 if denom == 0 else float(np.sum(a * b) / denom)


def compare_contours(reference_contour: Contour, user_contour: Contour) -> Comparison | None:
    reference = semitone_track(reference_contour)
    user = semitone_track(user_contour)
    if len(reference) < 8 or len(user) < 8:
        return None

    path = _dtw(user.semitone, reference.semitone)
    ui, ri = path[:, 0], path[:, 1]

    mean_deviation = float(np.mean(np.abs(user.semitone[ui] - reference.semitone[ri])))
    mean_drift = float(
        np.mean(np.abs(ui / (len(user) - 1) - ri / (len(reference) - 1)))
    )

    # Shape: the same melody at the same points in the sentence, timing aside.
    user_shape = _resample(user, SHAPE_POINTS)
    ref_shape = _resample(reference, SHAPE_POINTS)
    shape_deviation = float(np.mean(np.abs(user_shape - ref_shape)))

    # A semitone off on average is still good shadowing; 7+ is a different tune.
    intonation = _clamp_score(100 - shape_deviation * 14)

    # Timing: how far the alignment had to wander from the diagonal, plus how
    # closely the two utterances match in length.
    longest = max(user_contour.duration, reference_contour.duration or 1)
    length_ratio = min(user_contour.duration, reference_contour.duration) / longest
    rhythm = _clamp_score((100 - mean_drift * 320) * 0.55 + length_ratio * 100 * 0.45)

    # Stress: do the loud and quiet moments land in the same places once aligned.
    stress = _clamp_score(50 * (1 + _pearson(user.rms[ui], reference.rms[ri])))

    # Variation: is the voice moving as much as the source, not more or less.
    user_range = pitch_range(user)
    ref_range = pitch_range(reference)
    range_ratio = (
        0.0 if ref_range == 0 else min(user_range, ref_range) / max(user_range, ref_range)
    )
    variation = _clamp_score(range_ratio * 100)

    scores = {
        "Intonation": intonation,
        "Rhythm": rhythm,
        "Stress": stress,
        "Variation": variation,
    }
    score = _clamp_score(
        intonation * 0.4 + rhythm * 0.2 + stress * 0.2 + variation * 0.2
    )
    return Comparison(score, scores, mean_deviation, reference, user, path)
