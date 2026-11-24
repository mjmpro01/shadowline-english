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


# Spoken English is written more than one way, and a transcriber picks one. A
# learner who said "it's" has said "it is", and the reverse; the caption and the
# transcript are both expanded to the long form before they are compared, so
# neither choice of spelling costs a word.
_WHOLE = {
    "gonna": ["going", "to"],
    "wanna": ["want", "to"],
    "gotta": ["got", "to"],
    "kinda": ["kind", "of"],
    "sorta": ["sort", "of"],
    "lemme": ["let", "me"],
    "gimme": ["give", "me"],
    "'cause": ["because"],
    "cause": ["because"],
    "cos": ["because"],
    "cuz": ["because"],
    "ok": ["okay"],
    "can't": ["can", "not"],
    "cannot": ["can", "not"],
    "won't": ["will", "not"],
    "shan't": ["shall", "not"],
    "ain't": ["is", "not"],
    "let's": ["let", "us"],
    "y'all": ["you", "all"],
}
# Only the pronouns and question words take "'s" as "is": anywhere else it is a
# possessive ("John's car"), which is one word however it is said.
_IS_HOSTS = {
    "it", "he", "she", "that", "what", "there", "here", "where", "who", "how",
    "this", "when", "why", "everything", "nothing", "something", "everyone",
}
_SUFFIXES = (("n't", ["not"]), ("'m", ["am"]), ("'re", ["are"]), ("'ve", ["have"]),
             ("'ll", ["will"]), ("'d", ["would"]))
_NUMBERS = {
    "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five",
    "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten",
    "11": "eleven", "12": "twelve", "13": "thirteen", "14": "fourteen",
    "15": "fifteen", "16": "sixteen", "17": "seventeen", "18": "eighteen",
    "19": "nineteen", "20": "twenty",
}
# Words a contraction stands for either of: "he'd" is "he would" or "he had",
# "she's" is "she is" or "she has".
_EITHER = {frozenset({"would", "had"}), frozenset({"is", "has"})}


def _long_form(token: str) -> list[str]:
    """A token as the words it stands for, spelled out."""
    if token in _NUMBERS:
        return [_NUMBERS[token]]
    if token in _WHOLE:
        return list(_WHOLE[token])
    if token.endswith("'s") and token[:-2] in _IS_HOSTS:
        return [token[:-2], "is"]
    for suffix, rest in _SUFFIXES:
        if token.endswith(suffix) and len(token) > len(suffix):
            return [token[: -len(suffix)], *rest]
    return [token]


def _expand(tokens: list[str]) -> tuple[list[str], list[int]]:
    """The long form of a list of tokens, and which token each word came from."""
    words: list[str] = []
    origin: list[int] = []
    for index, token in enumerate(tokens):
        for word in _long_form(token):
            words.append(word)
            origin.append(index)
    return words, origin


def _edits(a: str, b: str) -> int:
    """Levenshtein distance between two short words."""
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb)))
        previous = current
    return previous[-1]


def _same(expected: str, heard: str) -> bool:
    """Whether a heard word is the expected one, allowing for the transcriber.

    Long words get a letter's slack, very long ones two: "walkin'" for
    "walking", "colour" for "color", a plural Whisper added. Short words get
    none, because "for" and "four", "a" and "the" are different words and a
    letter is most of them.
    """
    if expected == heard or frozenset({expected, heard}) in _EITHER:
        return True
    shorter = min(len(expected), len(heard))
    if shorter < 4:
        return False
    allowed = 2 if shorter >= 8 else 1
    return abs(len(expected) - len(heard)) <= allowed and _edits(expected, heard) <= allowed


def _aligned(expected: list[str], heard: list[str]) -> list[bool]:
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
    same = [[_same(e, h) for h in heard] for e in expected]
    cost = [[0] * (cols + 1) for _ in range(rows + 1)]
    for i in range(rows + 1):
        cost[i][0] = i
    for j in range(cols + 1):
        cost[0][j] = j
    for i in range(1, rows + 1):
        for j in range(1, cols + 1):
            cost[i][j] = min(
                cost[i - 1][j - 1] + (0 if same[i - 1][j - 1] else 1),
                cost[i - 1][j] + 1,
                cost[i][j - 1] + 1,
            )

    hit = [False] * rows
    i, j = rows, cols
    while i > 0 and j > 0:
        if same[i - 1][j - 1] and cost[i][j] == cost[i - 1][j - 1]:
            hit[i - 1] = True
            i, j = i - 1, j - 1
        elif cost[i][j] == cost[i - 1][j - 1] + 1:
            i, j = i - 1, j - 1  # said something else here
        elif cost[i][j] == cost[i - 1][j] + 1:
            i -= 1  # dropped this word
        else:
            j -= 1  # said a word that is not in the line
    return hit


def _matched(expected: list[str], heard: list[str]) -> list[bool]:
    """Per expected token, whether it was heard: every word of its long form
    has to be, so "don't" heard as "do" alone is not "don't"."""
    expected_words, origin = _expand(expected)
    heard_words, _ = _expand(heard)
    word_hit = _aligned(expected_words, heard_words)
    hit = [True] * len(expected)
    for index, ok in zip(origin, word_hit):
        hit[index] = hit[index] and ok
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

    None when there is nothing to compare: a clip with no caption.

    A transcript with no words in it is not nothing to compare — it is none of
    the line heard, and it scores that way. It used to be let through, on the
    view that a quiet room or a poor microphone empties a transcript as often
    as silence does; in practice it let a take with nobody in it keep its whole
    prosody score, and prosody will happily measure a fan. A take that reaches
    this point has already passed the check for speech in the signal, so an
    empty transcript here is a voice Whisper could not make out a word of, and
    the floor in `gate` is what keeps that from costing everything.
    """
    expected_tokens = normalise(expected_line)
    heard_tokens = [token for word in heard_words for token in normalise(word)]
    if not expected_tokens:
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


def recheck(stored: dict) -> WordScore | None:
    """A stored word check, matched again with today's rules.

    `analysis.words` keeps the caption's words and what was heard, which is all
    the matching needs: a take is marked again without its recording or the
    transcriber (see `rescore.py`).
    """
    line = stored.get("line")
    heard = stored.get("heard")
    if not isinstance(line, list) or not isinstance(heard, list):
        return None
    caption = " ".join(str(entry.get("text", "")) for entry in line if isinstance(entry, dict))
    return check(caption, [str(word) for word in heard])
