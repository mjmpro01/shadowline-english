"""Writing down what a word means.

The app used to ship a fifteen-word table, and every other word a learner
tapped came back as the literal string "Auto-translated definition". This is
what replaces it.

Two halves, from two places:

* the pronunciation is CMUdict, which is a dictionary — free, offline, and the
  same answer every run;
* the meaning is asked for in order, cheapest first, and the first source with
  an answer wins.

The order is Merriam-Webster's Learner's Dictionary, then the model. The
dictionary is free and is written for people learning English, so for ordinary
words it is both cheaper and better suited than a model gloss. What it cannot
do is read the sentence — `really` in "Are you really going?" and `really` in
"I really like it" are different words to a learner — or say anything at all
about `gonna`, a name, or something coined last year.

So the model sits behind it rather than beside it: it answers the words the
dictionary has no entry for, and it is what runs when there is no dictionary
key. Neither source is required. With neither, a word still comes back with its
pronunciation, which is a smaller answer rather than a broken one.

The offline option was measured and rejected before either of these. The
English dictionaries bundled on PyPI are Webster derivatives: seven of fifteen
ordinary conversational words, missing `brilliant`, `gonna`, `okay`, `kidding`
and `guys` outright, and defining what they did have in words harder than the
word being defined.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Protocol

from . import ipa

log = logging.getLogger("shadowline.gloss")

# Opus, because the task is small but the judgement is not: which sense the
# sentence points at, and how to say it in words a learner already has. A gloss
# is written once and read by everyone who ever taps the word, so the few
# hundredths of a cent buys a sentence that stays in the app for good.
# Override with GLOSS_MODEL — claude-haiku-4-5 costs a fifth as much and is a
# reasonable trade if the bill ever matters more than the wording.
DEFAULT_MODEL = "claude-opus-5"

# One sentence. Enough for a definition and nowhere near enough for an essay,
# which is the point: the popup is four lines tall.
MAX_TOKENS = 100

SYSTEM = """\
You write dictionary definitions for a learner of English at about B1 level, \
inside a shadowing app. They have just tapped a word in a subtitle.

Reply with the definition and nothing else. No word, no part of speech, no \
pronunciation, no quotation marks, no full stop at the end, no preamble.

Rules:
- One clause, at most fifteen words.
- Use words simpler than the one being defined. Never define a word with \
itself or with a word built from it.
- If a sentence is given, define the sense used in that sentence, not the \
most common sense.
- Define contractions, fillers and slang (gonna, kinda, okay, guys) the way \
they are actually used in speech.
"""


class GlossFailed(RuntimeError):
    """The word cannot be glossed, and retrying will not change that."""


class Glosser(Protocol):
    """One place a meaning can come from.

    Returning "" means "I do not have this word", which passes it to the next
    source. Raising GlossFailed means the same and says why. Anything else
    raising is a real failure and puts the job back on the queue.
    """

    #: Recorded on the gloss, so the app can credit the source it came from —
    #: which Merriam-Webster's licence requires and honesty recommends.
    name: str

    def meaning(self, word: str, context: str) -> str: ...


class ClaudeGlosser:
    """Definitions from the Claude API.

    The backstop rather than the first stop: it answers the words no dictionary
    has, and it is the only source that reads the sentence the word was tapped
    in.

    Constructed lazily so a worker with no API key still starts and still fills
    in the pronunciations; see `gloss` below.
    """

    name = "claude"

    def __init__(self, model: str | None = None) -> None:
        import anthropic

        self.model = model or os.environ.get("GLOSS_MODEL", DEFAULT_MODEL)
        # Reads ANTHROPIC_API_KEY from the environment. Raising here rather
        # than on the first job is deliberate: the worker checks at startup.
        self.client = anthropic.Anthropic()

    def meaning(self, word: str, context: str) -> str:
        import anthropic

        asked = f"Word: {word}"
        if context:
            asked += f"\nSentence: {context}"

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=MAX_TOKENS,
                # A one-clause definition is not worth thinking about, and
                # thinking is on by default on Opus. Turning it off is most of
                # the latency and most of the cost, and somebody is waiting.
                thinking={"type": "disabled"},
                output_config={"effort": "low"},
                system=SYSTEM,
                messages=[{"role": "user", "content": asked}],
            )
        # Nothing here is caught as "this word has no definition". A 401, a
        # model name with a typo in it and a rate limit are all configuration
        # or weather, and treating any of them as an answer about the word
        # would write an empty meaning into the cache for ever. They travel,
        # the job goes back on the queue, and the operator sees them.
        except anthropic.APIConnectionError as err:
            raise RuntimeError(f"cannot reach the API: {err}") from err

        if response.stop_reason == "refusal":
            raise GlossFailed("the model declined to define this word")

        text = "".join(block.text for block in response.content if block.type == "text")
        return _tidy(text)


# The model is told not to, but a stray label or a pair of quotes now and then
# is cheaper to strip than to retry over.
_LABEL = re.compile(r"^\s*(definition|meaning)\s*:\s*", re.IGNORECASE)


def _tidy(text: str) -> str:
    """The one line of it, without the decorations."""
    line = text.strip().splitlines()[0] if text.strip() else ""
    line = _LABEL.sub("", line).strip()
    return line.strip('"').strip("'").rstrip(".").strip()


def first_answer(sources: list[Glosser], word: str, context: str) -> tuple[str, str]:
    """The first source with something to say, and which one it was.

    A source that does not have the word steps aside rather than ending the
    lookup: that is the whole point of having more than one. A source that is
    broken does not — the exception travels, the job goes back on the queue,
    and the next attempt gets a fresh go at it.
    """
    for source in sources:
        try:
            meaning = source.meaning(word, context)
        except GlossFailed as err:
            log.info("%s has nothing for %r (%s)", source.name, word, err)
            continue
        if meaning:
            return meaning, source.name
        log.info("%s has nothing for %r", source.name, word)
    return "", ""


def gloss(word: str, context: str, sources: list[Glosser]) -> tuple[str, str, str]:
    """A word's pronunciation, its meaning, and where the meaning came from.

    The pronunciation is looked up independently of the meaning on purpose.
    CMUdict has no idea what `gonna` means and no source of meanings has any
    business guessing at stress marks, and either half being empty is a worse
    answer than it could be rather than no answer at all: a popup showing
    /ˈbrɪljənt/ and nothing else is still useful.
    """
    said = ipa.for_word(word)
    if not said:
        log.info("no pronunciation for %r — CMUdict has not heard of it", word)

    meaning, source = first_answer(sources, word, context)
    if sources and not meaning:
        # Every source was asked and none of them had this word — a name, a
        # coinage, something the model declined. That is an answer, so it is
        # written down: the pronunciation is still worth showing, and caching
        # it stops the next tap paying to be told the same thing.
        #
        # Only a definitive "not this word" reaches here. A source that is
        # down, rate-limited or misconfigured raises instead, and the job goes
        # back on the queue rather than into the cache.
        log.warning("no source had a definition for %r", word)
    return said, meaning, source
