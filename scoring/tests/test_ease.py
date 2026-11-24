"""The generous scale a learner's score is shown on."""

import pytest

from shadowline.compare import headline
from shadowline.ease import (
    SCORING_VERSION,
    ease,
    ease_accuracy,
    ease_scores,
    mark,
)
from shadowline.words import FLOOR, check


@pytest.mark.parametrize(
    "raw, shown",
    [(0, 0), (10, 40), (20, 53), (30, 62), (40, 69), (50, 76), (60, 82), (70, 87),
     (80, 91), (90, 96), (100, 100)],
)
def test_the_curve(raw, shown):
    assert ease(raw) == shown


def test_a_decent_take_reaches_gold():
    # The point of the change: what used to read 55-65 now reads above the gold
    # band at 75.
    assert ease(55) >= 75


def test_the_order_of_two_takes_never_changes_and_nothing_goes_down():
    shown = [ease(raw) for raw in range(101)]
    assert shown == sorted(shown)
    assert all(ease(raw) >= raw for raw in range(101))


def test_out_of_range_is_clamped():
    assert ease(-5) == 0
    assert ease(130) == 100


def test_each_metric_is_on_the_headline_scale():
    assert ease_scores({"Intonation": 50, "Rhythm": 80}) == {"Intonation": 76, "Rhythm": 91}


@pytest.mark.parametrize("accuracy, counted", [(0.0, 0.0), (0.4, 0.5), (0.8, 1.0), (0.9, 1.0), (1.0, 1.0)])
def test_most_of_the_line_counts_as_all_of_it(accuracy, counted):
    assert ease_accuracy(accuracy) == pytest.approx(counted)


RAW = {"Intonation": 50, "Rhythm": 60, "Stress": 55, "Variation": 45}


def test_mark_eases_the_headline_and_keeps_what_was_measured():
    score, scores, raw = mark(RAW, None)
    assert raw == {"score": headline(RAW), "scores": RAW, "version": SCORING_VERSION}
    assert score == ease(headline(RAW))
    assert scores == ease_scores(RAW)


def test_a_line_mostly_said_is_not_marked_down():
    said = check("we were on a break today", ["we", "were", "on", "break", "today"])
    assert said.accuracy == pytest.approx(5 / 6)
    assert mark(RAW, said)[0] == ease(headline(RAW))


def test_a_hummed_line_is_still_held_down_by_the_words():
    hummed = check("we were on a break", [])
    score, _, _ = mark(RAW, hummed)
    assert score == round(ease(headline(RAW)) * FLOOR)
    assert score < 40
