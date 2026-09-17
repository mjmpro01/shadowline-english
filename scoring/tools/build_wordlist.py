"""Rebuilds shadowline/data/common_words.txt.

Run by hand, not by the app: the list is checked in so that seeding a database
needs nothing but this repository, and so that two deployments seeded a year
apart hold the same words.

    pip install wordfreq && python tools/build_wordlist.py

`wordfreq` is the source because it is a real frequency list rather than a
scrape — the words are ordered by how often people actually say them, which is
the order worth spending a lookup budget in.

Two filters. Anything that is not letters and apostrophes goes, which removes
the fragments a frequency list collects ("wr", "yi", "_"). Then anything
CMUdict has never heard of goes, which removes the rest of the junk and
guarantees the other thing this list is for: every word in it gets a real
pronunciation the moment it is seeded, before any meaning is paid for.

Proper nouns survive both filters — "nile", "ralph" — because nothing here can
tell them from common words once a frequency list has lowercased everything.
They are left in: a learner who taps one in a caption wants an answer too, and
they are about three in a hundred.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shadowline import ipa  # noqa: E402

WANTED = 12_000

# Two letters or more, or the two English words that are one.
SHAPE = re.compile(r"[a-z']{2,}")
SINGLE_LETTER_WORDS = {"a", "i"}

DEST = Path(__file__).resolve().parents[1] / "shadowline" / "data" / "common_words.txt"


def build(wanted: int = WANTED) -> list[str]:
    from wordfreq import top_n_list

    words: list[str] = []
    # Reaching further down the frequency list than `wanted`, because the
    # filters below take a few hundred out of any slice of it.
    for word in top_n_list("en", wanted * 3):
        if not (SHAPE.fullmatch(word) or word in SINGLE_LETTER_WORDS):
            continue
        if not ipa.for_word(word):
            continue
        words.append(word)
        if len(words) >= wanted:
            break
    return words


def main() -> int:
    words = build()
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text("\n".join(words) + "\n", encoding="utf-8")
    print(f"wrote {len(words)} words to {DEST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
