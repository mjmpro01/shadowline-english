"""Whether the learner said the words, not just the tune.

Everything else the scoring worker measures is prosody: where the pitch goes,
where the stress lands, how much the voice moves. None of it looks at what was
actually said, which meant somebody could hum the melody of a line and score
ninety on it.

So the take is transcribed and matched against the line the clip asked for. What
comes back is per expected word — heard or not — because "you dropped 'about'"
is something a learner can act on and "82%" is not.

A transcriber is not a phonetician, and this module is written around that. A
word marked missing is a word Whisper did not hear, which is evidence and not a
verdict; the screens say it that way, and everything here leans towards letting
a word through rather than accusing the learner of dropping it.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

# What counts as part of a word: letters, digits, and the apostrophe inside
# "it's". Everything else is punctuation the learner does not pronounce.
_STRIP = re.compile(r"[^\w']+", re.UNICODE)


def normalise(text: str) -> list[str]:
    """The comparable words of a line.

    Case and punctuation go; the apostrophe stays, because "its" and "it's" are
    two words and a learner who said the wrong one said the wrong one. The
    curly apostrophe is folded onto the straight one first — a caption typed in
    a word processor should not read as a different line from the same caption
    typed in the studio.
    """
    folded = unicodedata.normalize("NFC", text).replace("’", "'").lower()
    return [token for token in _STRIP.split(folded) if token.strip("'")]


def _matched(expected: list[str], heard: list[str]) -> list[bool]:
    """Which expected words appear, in order, in what was heard.

    A Levenshtein alignment rather than a set intersection: a line repeats words
    ("it's not about winning, it's about showing up") and set membership would
    score both copies from one. The table is at most a few dozen cells square —
    a clip is one line of speech.

    Ties go to the match. Where a substitution and a deletion cost the same, the
    backtrace below takes the diagonal, which is the reading that credits the
    learner.
    """
    rows, cols = len(expected), len(heard)
    cost = [[0] * (cols + 1) for _ in range(rows + 1)]
    for i in range(rows + 1):
        cost[i][0] = i
    for j in range(cols + 1):
        cost[0][j] = j
    for i in range(1, rows + 1):
        for j in range(1, cols + 1):
            same = expected[i - 1] == heard[j - 1]
            cost[i][j] = min(
                cost[i - 1][j - 1] + (0 if same else 1),
                cost[i - 1][j] + 1,
                cost[i][j - 1] + 1,
            )

    hit = [False] * rows
    i, j = rows, cols
    while i > 0 and j > 0:
        if expected[i - 1] == heard[j - 1] and cost[i][j] == cost[i - 1][j - 1]:
            hit[i - 1] = True
            i, j = i - 1, j - 1
        elif cost[i][j] == cost[i - 1][j - 1] + 1:
            i, j = i - 1, j - 1  # said something else here
        elif cost[i][j] == cost[i - 1][j] + 1:
            i -= 1  # dropped this word
        else:
            j -= 1  # said a word that is not in the line
    return hit


@dataclass
class WordScore:
    """What was heard of the line, and how much of it."""

    # Per expected word, in order: the word as the caption writes it, and
    # whether the transcriber heard it. The caption's own spelling rather than
    # the normalised token, because this is drawn under the line on screen.
    line: list[tuple[str, bool]]
    heard: list[str]

    @property
    def accuracy(self) -> float:
        if not self.line:
            return 1.0
        return sum(1 for _, ok in self.line if ok) / len(self.line)

    def as_json(self) -> dict:
        return {
            "accuracy": round(self.accuracy, 4),
            "heard": self.heard,
            "line": [{"text": text, "heard": ok} for text, ok in self.line],
        }


def check(expected_line: str, heard_words: list[str]) -> WordScore | None:
    """Match a transcript against the line the clip asked for.

    None when there is nothing to compare — a clip with no caption, or a
    transcript with no words in it. The second is the important one: an empty
    transcript means a quiet room or a poor microphone at least as often as it
    means silence, and a learner should not lose a score over the difference.
    """
    expected_tokens = normalise(expected_line)
    heard_tokens = [token for word in heard_words for token in normalise(word)]
    if not expected_tokens or not heard_tokens:
        return None

    spoken = [word for word in re.split(r"\s+", expected_line.strip()) if normalise(word)]
    hit = _matched(expected_tokens, heard_tokens)
    # `spoken` and `expected_tokens` can disagree when one written word
    # normalises to two tokens. Falling back to the tokens keeps the two lists
    # the same length, which is what the screen indexes into.
    if len(spoken) != len(hit):
        spoken = expected_tokens
    return WordScore(line=list(zip(spoken, hit)), heard=heard_tokens)


# How much of the prosody score survives saying none of the words.
#
# Not zero: the four metrics still measured something real, and a transcriber
# that heard the wrong words is sometimes a transcriber that was wrong. Not one
# either, which is what it used to be — a hummed line scored like a spoken one,
# and that made the headline number a lie.
FLOOR = 0.4


def gate(score: int, accuracy: float) -> int:
    """The prosody score, scaled by how much of the line was heard.

    A score for how well you said something means nothing if you did not say
    it. This is the one place that opinion is expressed as arithmetic.
    """
    return round(score * (FLOOR + (1 - FLOOR) * max(0.0, min(1.0, accuracy))))
