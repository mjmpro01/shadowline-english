"""Writing down what a word means.

The app used to ship a fifteen-word table, and every other word a learner
tapped came back as the literal string "Auto-translated definition". This is
what replaces it.

Two halves, from two places:

* the pronunciation is CMUdict, which is a dictionary — free, offline, and the
  same answer every run;
* the meaning is a model, because no bundled dictionary is any use here. The
  offline ones are Webster derivatives: they miss `gonna`, `okay`, `kidding`
  and `guys` outright, and define what they do have in words harder than the
  word being defined. A learner at B1 reading "brilliant: characterized by
  refulgence" has been given a second thing to look up.

The model is also the only thing that can read the sentence. `really` in "Are
you really going?" and `really` in "I really like it" are different words to a
learner, and the caption is right there.
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
    def meaning(self, word: str, context: str) -> str: ...


class ClaudeGlosser:
    """Definitions from the Claude API.

    Constructed lazily so a worker with no API key still starts and still fills
    in the pronunciations; see `gloss` below.
    """

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
        except anthropic.APIStatusError as err:
            # 4xx is the request — a word the model will not define, a model
            # name that does not exist. Retrying sends the same request again.
            if err.status_code < 500:
                raise GlossFailed(f"{err.status_code}: {err.message}") from err
            raise
        except anthropic.APIConnectionError as err:
            # Worth another go: the queue will bring the job back.
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


def gloss(word: str, context: str, glosser: Glosser | None) -> tuple[str, str]:
    """A word's pronunciation and meaning.

    The two are looked up independently on purpose. CMUdict has no idea what
    `gonna` means and the model has no business guessing at stress marks, and
    either half being empty is a worse answer than it could be rather than no
    answer at all: a popup showing /ˈbrɪljənt/ and nothing else is still useful.
    """
    said = ipa.for_word(word)
    if not said:
        log.info("no pronunciation for %r — CMUdict has not heard of it", word)

    if glosser is None:
        return said, ""

    meaning = glosser.meaning(word, context)
    if not meaning:
        raise GlossFailed("the model returned nothing")
    return said, meaning
