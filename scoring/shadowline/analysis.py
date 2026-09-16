"""The contour payload the Analysis screen draws.

Shaped to match ``TakeAnalysis`` in ``app/src/data/types.ts`` exactly — the
browser used to build this itself, and the chart code is unchanged.
"""

from __future__ import annotations

import numpy as np

from .compare import Comparison
from .pitch import Contour

# The chart is a few hundred pixels wide, so more points than this are drawn on
# top of each other; sending them all would only make the row bigger.
MAX_POINTS = 400


def _thin(count: int) -> np.ndarray:
    """Indices spread evenly across ``count`` points, at most MAX_POINTS of them."""
    if count <= MAX_POINTS:
        return np.arange(count)
    return np.unique(np.linspace(0, count - 1, MAX_POINTS).round().astype(int))


def build(comparison: Comparison, user_contour: Contour) -> dict:
    user, reference = comparison.user, comparison.reference

    # Local deviation per user frame, so the line can be coloured by how far off
    # it was at each moment. A frame can appear several times in the path when
    # the alignment stretches; the largest distance is the honest one to show.
    deviation = np.zeros(len(user))
    for ui, ri in comparison.path:
        deviation[ui] = max(deviation[ui], abs(user.semitone[ui] - reference.semitone[ri]))

    keep = _thin(len(user))
    user_points = [
        {
            "t": round(float(user.time[i]), 4),
            "s": round(float(user.semitone[i]), 3),
            "d": round(float(deviation[i]), 3),
        }
        for i in keep
    ]

    ref_keep = _thin(len(reference))
    reference_points = [
        {"t": round(float(reference.time[i]), 4), "s": round(float(reference.semitone[i]), 3)}
        for i in ref_keep
    ]

    return {
        "user": user_points,
        "reference": reference_points,
        "duration": round(user_contour.duration, 4),
        "meanDeviation": round(comparison.mean_deviation, 4),
    }
