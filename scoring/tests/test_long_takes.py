"""A whole song sung through: aligned in reasonable time, and a line exactly as
it always was."""

import time

import numpy as np

from shadowline.compare import _banded_dtw, _dtw


def melody(frames: int, stretch: float = 1.0) -> np.ndarray:
    return np.sin(np.arange(frames) / (40 * stretch)) * 3


def test_a_line_is_aligned_exactly_as_it_always_was():
    a, b = melody(800), melody(900, 1.1)
    assert np.array_equal(_dtw(a, b), _banded_dtw(a, b))


def test_a_whole_song_is_aligned_quickly_from_start_to_end():
    # Six minutes against a take a little quicker, at a 10ms hop.
    a, b = melody(36_000), melody(34_200, 0.95)
    started = time.perf_counter()
    path = _dtw(a, b)
    assert time.perf_counter() - started < 30

    assert tuple(path[0]) == (0, 0)
    assert tuple(path[-1]) == (len(a) - 1, len(b) - 1)
    assert np.all(np.diff(path, axis=0) >= 0)
    assert path[:, 0].max() < len(a) and path[:, 1].max() < len(b)
