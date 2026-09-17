"""Rebuilds shadowline/data/glosses.tsv from the FreeTalk Dictionary.

Run by hand, not by the app, and its output is checked in. The point is that a
fresh database has definitions in it without anybody holding an API key, paying
anything, or waiting for a free tier to drip them out.

    git clone --depth 1 https://github.com/freetalk-fun/freetalk-dictionary-v1 /tmp/freetalk
    python tools/build_seed_glosses.py --dictionary /tmp/freetalk/words

## Licence — read this before shipping anything

The FreeTalk Dictionary is **CC BY-NC 4.0**. Non-commercial only. Personal and
research use is free; a product that makes money needs a licence from them
(eron@freetalk.fun). Attribution is required, and so is saying that changes
were made — this takes the first definition of each word and rewrites nothing
else, which is the change.

`shadowline/data/FREETALK_LICENSE` travels with the output and the app credits
the source under every definition it wrote. If Shadowline ever charges for
anything, either get that licence or run
`python -m shadowline.seedwords --requeue-source freetalk`, which sends every
one of these words back through the sources that are licensed for it.

## Why this and not WordNet

WordNet was tried first and measured: 93% coverage, and unusable at the top of
the frequency list. It indexes chemical symbols, US state abbreviations and
acronyms as ordinary lemmas, and for short common words those win. It defines
`was` as a state in the Pacific northwest (WA), `be` as a brittle grey metal
(Be), `who` as a United Nations agency and `more` as the statesman who opposed
Henry VIII's divorce. Where it found a real sense it found the wrong one, since
it lists nouns first: `see` was a bishop's seat, `go` was a work shift, `well`
was a deep shaft. A learner reading any of those is worse off than one shown
nothing.

This dictionary answers all of them correctly — `was` is "past tense of 'be'",
`be` is "exist", `see` is "Perceive with the eyes" — and it has the spoken
words a shadowing app actually meets, `gonna` and `okay` and `guys` among them.
It covers 89% of the 12,000 against WordNet's 93%, and the 11% is mostly
contractions it files under no name at all: `don't`, `it's`, `i'm`. Those go to
the sources behind it, which is what they are for.

The `pos` field in the data is not used. It is wrong often enough to notice —
`gonna` is tagged a preposition, `who` a verb — and nothing here needs it.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shadowline import ipa  # noqa: E402

HERE = Path(__file__).resolve().parents[1] / "shadowline" / "data"
WORDS = HERE / "common_words.txt"
DEST = HERE / "glosses.tsv"

SOURCE = "freetalk"

# Longer than this and it is a paragraph, not something to read in a popup four
# lines tall.
MAX_WORDS = 25


def clean(definition: str) -> str:
    """One readable line."""
    text = " ".join(str(definition).split())
    text = text.strip().strip('"').rstrip(".").strip()
    return "" if len(text.split()) > MAX_WORDS else text


def is_circular(word: str, definition: str) -> bool:
    """Whether the definition explains the word with the word.

    "consistency: the quality of being consistent" is not wrong, it is just no
    help to the person who tapped it. Better to try the next sense, and failing
    that to leave the word for a source that can write a fresh sentence.
    """
    stem = word.rstrip("s") or word
    return bool(re.search(rf"\b{re.escape(stem)}\w*\b", definition, re.IGNORECASE))


def definition_for(entry: dict, word: str) -> str:
    """The first sense that is both short enough and not circular."""
    for meaning in entry.get("meanings") or []:
        text = clean(meaning.get("definition", ""))
        if text and not is_circular(word, text):
            return text
    return ""


def build(dictionary: Path) -> list[tuple[str, str, str, str]]:
    rows = []
    missing = unusable = 0
    for word in WORDS.read_text(encoding="utf-8").split():
        path = dictionary / f"{word}.json"
        if not path.exists():
            missing += 1
            continue
        try:
            entry = json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            unusable += 1
            continue
        text = definition_for(entry, word)
        if not text:
            unusable += 1
            continue
        rows.append((word, ipa.for_word(word), text, SOURCE))

    print(
        f"{len(rows)} glosses; {missing} words the dictionary does not have, "
        f"{unusable} with no usable sense — both left for the sources behind it"
    )
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dictionary",
        type=Path,
        required=True,
        help="the `words/` directory of a freetalk-dictionary-v1 checkout",
    )
    args = parser.parse_args(argv)

    if not args.dictionary.is_dir():
        print(f"{args.dictionary} is not a directory", file=sys.stderr)
        return 1

    rows = build(args.dictionary)
    with DEST.open("w", encoding="utf-8") as out:
        out.write("# word\tipa\tmeaning\tsource\n")
        out.write("# Definitions from the FreeTalk Dictionary V1, "
                  "Copyright 2024-present FreeTalk.fun, CC BY-NC 4.0.\n")
        out.write("# https://github.com/freetalk-fun/freetalk-dictionary-v1\n")
        out.write("# Changed: the first short, non-circular sense of each word was taken,\n")
        out.write("# and nothing else was kept. See FREETALK_LICENSE beside this file.\n")
        out.write("# NON-COMMERCIAL. A product that makes money needs a licence from them.\n")
        out.write("# Rebuild with tools/build_seed_glosses.py.\n")
        for word, said, meaning, source in rows:
            out.write(f"{word}\t{said}\t{meaning}\t{source}\n")
    print(f"wrote {DEST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
