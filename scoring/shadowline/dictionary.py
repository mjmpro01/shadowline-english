"""Merriam-Webster's Learner's Dictionary.

Chosen over Oxford because Oxford no longer has a free plan — a 500-call
sandbox to evaluate with, then £50 a month — and over the keyless
dictionaryapi.dev because that one's published uptime is 93.8% over thirty days
with a seven-day mean response of twenty seconds, and a learner is watching the
popup.

Chosen over both on the merits, though: this is the one dictionary written for
people learning English rather than for people who already have it. "brilliant"
comes back as something a B1 learner can read, not as "characterized by
refulgence".

Free for non-commercial use at a thousand lookups a day per key, which the
gloss cache makes plenty — a word is looked up once for the whole app, ever.
Two conditions come with it and neither is optional: the Merriam-Webster logo
has to appear wherever the definitions do, and an app that makes money needs a
licence. See ../../server/README.md.

Best-effort by design. Every failure here — no key, a network error, a shape
this does not recognise, a word the dictionary does not have — returns nothing
rather than raising, and the caller falls through to the next source. A wrong
guess about the response costs one API call somewhere else, not a broken popup.
"""

from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request

log = logging.getLogger("shadowline.dictionary")

NAME = "merriam-webster-learners"

ENDPOINT = "https://www.dictionaryapi.com/api/v3/references/learners/json/"

# A learner is waiting on the popup. Better to fall through to the model than to
# hold the queue open for a dictionary that is not answering.
TIMEOUT_SECONDS = 6.0

# Merriam-Webster marks up its text with tokens like {bc} (a bold colon) and
# {it}...{/it}. `shortdef` is usually clean, but stripping them costs nothing
# and a learner should never be shown a stray brace.
MARKUP = re.compile(r"\{[^{}]*\}")


class LearnersDictionary:
    """Definitions from Merriam-Webster, or nothing at all."""

    name = NAME

    def __init__(self, key: str, endpoint: str = ENDPOINT, timeout: float = TIMEOUT_SECONDS) -> None:
        self.key = key
        self.endpoint = endpoint
        self.timeout = timeout

    def meaning(self, word: str, context: str) -> str:
        """The shortest sense the dictionary lists, or "" when it has none.

        The sentence is ignored: a dictionary cannot read one. That is the
        trade being made by asking a dictionary first, and it is why the model
        stays behind it rather than being replaced by it.
        """
        del context

        payload = self._fetch(word)
        if payload is None:
            return ""
        return _definition_of(payload, word)

    def _fetch(self, word: str) -> object | None:
        url = f"{self.endpoint}{urllib.parse.quote(word)}?key={urllib.parse.quote(self.key)}"
        try:
            with urllib.request.urlopen(url, timeout=self.timeout) as response:
                return json.load(response)
        # Broadly: the dictionary is the optional half. Whatever went wrong with
        # it — down, slow, rate-limited, a key that expired, a body that is not
        # JSON — the answer is to let the model have the word.
        except (urllib.error.URLError, OSError, ValueError) as err:
            log.warning("dictionary lookup of %r failed (%s) — falling through", word, err)
            return None


def _definition_of(payload: object, word: str) -> str:
    """The first short definition belonging to the word asked about.

    Two shapes matter. A match is a list of entry objects. A miss is a list of
    plain strings — Merriam-Webster answers an unrecognised word with spelling
    suggestions rather than an error — and an empty list is a miss with no
    suggestions to make. Anything else is a shape this does not know, and is
    treated as a miss.
    """
    if not isinstance(payload, list):
        return ""

    for entry in payload:
        # A suggestion, not an entry. Nothing after it will be one either.
        if not isinstance(entry, dict):
            return ""
        if not _is_about(entry, word):
            continue
        for short in entry.get("shortdef") or []:
            cleaned = _tidy(short)
            if cleaned:
                return cleaned
    return ""


def _is_about(entry: dict, word: str) -> bool:
    """Whether this entry is the word asked about rather than a near miss.

    Merriam-Webster answers a request with everything in the neighbourhood, so
    asking for "expecting" can bring back "expect" — wanted, because the entry
    lists "expecting" among its stems — alongside entries for other words
    entirely, which are not. Matching on the headword and its inflections is
    what tells them apart; without it a learner tapping one word reads the
    definition of another.
    """
    meta = entry.get("meta")
    if not isinstance(meta, dict):
        return False

    # Homographs are numbered: "bear:1", "bear:2".
    headword = str(meta.get("id", "")).split(":", 1)[0].lower()
    if headword == word:
        return True

    stems = meta.get("stems")
    return isinstance(stems, list) and word in {str(s).lower() for s in stems}


def _tidy(text: str) -> str:
    """One readable line, without the markup tokens."""
    return MARKUP.sub("", str(text)).strip().strip(":").strip()


def _probe() -> int:
    """`python -m shadowline.dictionary <word>` — check a real key by hand.

    Here because the response shape could not be verified against the live API
    when this was written: the network the code was written on blocks
    dictionaryapi.com, so the parsing below follows Merriam-Webster's published
    documentation rather than a response anybody had seen. This prints what came
    back beside what was made of it, so one command settles it.
    """
    import os
    import sys

    if len(sys.argv) < 2:
        print("usage: python -m shadowline.dictionary <word> [...]", file=sys.stderr)
        return 2
    key = os.environ.get("DICTIONARY_API_KEY", "").strip()
    if not key:
        print("DICTIONARY_API_KEY is required", file=sys.stderr)
        return 1

    logging.basicConfig(level="INFO", format="%(levelname)s %(message)s")
    dictionary = LearnersDictionary(key)
    for word in sys.argv[1:]:
        payload = dictionary._fetch(word)
        shape = "unreachable"
        if isinstance(payload, list):
            kinds = sorted({type(entry).__name__ for entry in payload})
            shape = f"list[{', '.join(kinds) or 'empty'}] of {len(payload)}"
        elif payload is not None:
            shape = type(payload).__name__
        print(f"{word}\n  raw:     {shape}")
        if isinstance(payload, list) and payload and isinstance(payload[0], dict):
            print(f"  keys:    {sorted(payload[0])}")
            print(f"  meta:    {payload[0].get('meta', {}).get('id')!r}")
            print(f"  shortdef:{payload[0].get('shortdef')!r}")
        print(f"  parsed:  {_definition_of(payload, word)!r}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(_probe())
