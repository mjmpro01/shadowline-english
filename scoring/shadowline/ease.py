"""How generous the score a learner sees is.

`compare.py` measures; this decides what the measurement is worth. The two are
kept apart on purpose. The measurement is pinned to the archived browser scorer
by the parity tests and to what it means by the property tests, and neither
has to move when the marking does — a raw 60 still means what it always meant,
it is just no longer what the learner is shown.

The marking is generous by design. Shadowing is practice, and a learner who
said the line, in roughly the right tune, has done the thing: the old scale
put that at 55–65, below the gold band at 75, and a number that says "not good
enough" to a decent take is a number that sends people away. So:

- every score is lifted along one curve, ``100 · (raw / 100) ** EXPONENT``:
  raw 50 is shown as 76, raw 60 as 82, raw 80 as 91. The ends stay put — 0 is
  0 and 100 is 100 — and the order of any two takes never changes, so a better
  take still always scores higher;
- hearing most of the line counts as hearing all of it (`ease_accuracy`).

What it does not forgive is not saying the line. The word gate in `words.py`
still holds a hummed or mumbled take down, whatever its tune: raw 50 becomes
76, and with none of the words heard, 30.
"""

from __future__ import annotations

from . import words as wordcheck
from .compare import _clamp_score, headline

# The curve's bend. 1 is the raw scale; lower is kinder to the middle.
EXPONENT = 0.4

# The share of the line heard that already counts as all of it. Whisper drops a
# short word from fast speech often enough that 80% is a full line said.
WHOLE_LINE = 0.8

# Written on every take scored this way, so takes scored before it can be found
# and rescored (see `rescore.py`). Raise it when the marking changes again.
SCORING_VERSION = 2


def ease(raw: float) -> int:
    """A raw 0–100 score on the generous scale, rounded as the browser rounds."""
    clamped = max(0.0, min(100.0, float(raw)))
    return _clamp_score(100.0 * (clamped / 100.0) ** EXPONENT)


def ease_scores(raw: dict[str, int]) -> dict[str, int]:
    """Each metric on the same scale as the headline, so the breakdown under a
    score never reads lower than the score it explains."""
    return {name: ease(value) for name, value in raw.items()}


def ease_accuracy(accuracy: float) -> float:
    """How much of the line counts as said, with most of it counting as all."""
    return max(0.0, min(1.0, accuracy / WHOLE_LINE))


def mark(
    raw_scores: dict[str, int], matched: wordcheck.WordScore | None
) -> tuple[int, dict[str, int], dict]:
    """What a take is worth, from what was measured.

    The four metrics are prosody, and prosody is a measure of how well you said
    something; whether you said it at all is the word check's question, and a
    hummed line is held down by it. Both are marked on the generous scale.
    What was measured is returned beside the mark, to be kept with the take, so
    the marking can change again without the recording.
    """
    raw_score = headline(raw_scores)
    score = ease(raw_score)
    if matched is not None:
        score = wordcheck.gate(score, ease_accuracy(matched.accuracy))
    raw = {"score": raw_score, "scores": dict(raw_scores), "version": SCORING_VERSION}
    return score, ease_scores(raw_scores), raw
