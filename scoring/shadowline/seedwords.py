"""Filling the gloss cache before anybody taps anything.

Without this the cache starts empty and the first learner to tap each word
waits for it — which, at the start, is every word.

Two files ship beside this one. `data/common_words.txt` is the 12,000 commonest
English words in frequency order, every one of them in CMUdict.
`data/glosses.tsv` is a definition for 10,629 of them, taken from the FreeTalk
Dictionary. Between them, running this with no key of any kind and no network
gives a database where nearly every word a learner taps already has an answer.

    python -m shadowline.seedwords               # pronunciations and definitions, free
    python -m shadowline.seedwords --meanings    # queue what is still missing
    python -m shadowline.seedwords --meanings --limit 2000

Pronunciations come from CMUdict and land in under a second. Definitions are
read from the file, which costs nothing either. What is left after that — about
1,300 words, mostly contractions the dictionary files under no name (`don't`,
`it's`, `i'm`) — is the only part that needs a key, and `--meanings` is what
asks for it. The command says what it is about to commit to before it does.

The seeded definitions are **CC BY-NC 4.0**: free for personal and research use,
and a product that makes money needs a licence from freetalk.fun. See
`data/FREETALK_LICENSE`. If that does not suit, `--requeue-source freetalk`
sends every one of those words back through the sources that are licensed for
it, and the file can be deleted.

Safe to run again. A gloss already in the database always wins, so nothing it
does can undo what the glosser paid for.

    python -m shadowline.seedwords --export data/glosses.tsv   # after the glosser has run
    python -m shadowline.seedwords --import data/glosses.tsv   # anywhere else, instantly

is how a set of meanings produced once gets committed and reused. Definitions
do not change; paying for the same words twice buys nothing.

    python -m shadowline.seedwords --requeue-empty

is the one to run after turning a key on. A glosser with no source of meanings
still answers taps — it writes the pronunciation and settles the word, because
the alternative is a popup that spins for ever — so words met during that time
have a gloss with nothing in the meaning, and nothing would ever ask about them
again. This asks.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

import psycopg

log = logging.getLogger("shadowline.seedwords")

WORDS = Path(__file__).parent / "data" / "common_words.txt"
SEED_GLOSSES = Path(__file__).parent / "data" / "glosses.tsv"

# Roughly what one word costs on the default model, from Anthropic's published
# per-token prices and the size of the request this sends. An estimate for a
# sentence before spending anything, not a bill: a word Merriam-Webster answers
# costs nothing at all, and a smaller model is a fifth of this.
COST_PER_WORD_USD = 0.002


def load_words(path: Path = WORDS, limit: int | None = None) -> list[str]:
    words = [line.strip() for line in path.read_text(encoding="utf-8").splitlines()]
    words = [w for w in words if w]
    return words[:limit] if limit else words


def fill_pronunciations(conn: psycopg.Connection, words: list[str]) -> int:
    """Writes the IPA for every word that has none. Returns how many changed.

    Never touches a meaning. A word already glossed keeps what the glosser
    wrote; this only fills the half that costs nothing, and only where it is
    missing.
    """
    from . import ipa

    rows = [(word, ipa.for_word(word)) for word in words]
    rows = [row for row in rows if row[1]]

    with conn.transaction(), conn.cursor() as cur:
        cur.executemany(
            """
            insert into glosses (word, ipa) values (%s, %s)
            on conflict (word) do update set ipa = excluded.ipa
            where glosses.ipa = ''
            """,
            rows,
        )
    return len(rows)


def queue_meanings(conn: psycopg.Connection, words: list[str]) -> int:
    """Queues a lookup for every word without a meaning. Returns how many.

    No context: these are being glossed before anybody has met them in a
    sentence, which is the one thing seeding gives up. A word met later in a
    caption keeps the meaning seeded for it — the gloss is per word, not per
    sentence, exactly as it is for a word looked up on the spot.
    """
    with conn.transaction(), conn.cursor() as cur:
        cur.executemany(
            """
            insert into gloss_jobs (word, context)
            select %s, ''
            where not exists (
                select 1 from glosses where word = %s and meaning <> ''
            )
            on conflict (word) do nothing
            """,
            [(word, word) for word in words],
        )
        cur.execute("select count(*) from gloss_jobs")
        return cur.fetchone()[0]


def export_glosses(conn: psycopg.Connection, dest: Path) -> int:
    """Writes every finished gloss to a file. Returns how many.

    This is what makes a seed reusable. Meanings are the expensive half and
    they do not change: once they exist, writing them to a file that gets
    committed means every deployment afterwards — a colleague's laptop, CI, a
    rebuild — starts with them and asks nobody for anything.

    Tab-separated rather than JSON because it diffs a line per word, which is
    what makes a twelve-thousand-line file reviewable when it changes.
    """
    rows = conn.execute(
        "select word, ipa, meaning, source from glosses "
        "where meaning <> '' order by word"
    ).fetchall()

    with dest.open("w", encoding="utf-8") as out:
        out.write("# word\tipa\tmeaning\tsource\n")
        for word, said, meaning, source in rows:
            # A tab or a newline inside a definition would silently shift every
            # column after it. Neither belongs in one; spaces are the fix.
            meaning = " ".join(str(meaning).split())
            out.write(f"{word}\t{said}\t{meaning}\t{source}\n")
    return len(rows)


def import_glosses(conn: psycopg.Connection, source_file: Path) -> int:
    """Loads a file written by `export_glosses`. Returns how many rows landed.

    A gloss already in the database wins. The file is a starting point for an
    empty cache, not an authority over one that has been running — a meaning
    written for a word somebody actually tapped, with their sentence in front
    of it, is better than the one this file was generated without.
    """
    rows = []
    for line in source_file.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != 4:
            log.warning("skipping a line with %d columns: %.60s", len(parts), line)
            continue
        rows.append(tuple(parts))

    with conn.transaction(), conn.cursor() as cur:
        cur.executemany(
            """
            insert into glosses (word, ipa, meaning, source) values (%s, %s, %s, %s)
            on conflict (word) do update
            set ipa     = case when glosses.ipa = '' then excluded.ipa else glosses.ipa end,
                meaning = case when glosses.meaning = '' then excluded.meaning else glosses.meaning end,
                source  = case when glosses.meaning = '' then excluded.source else glosses.source end
            """,
            rows,
        )
    return len(rows)


def queue_by_source(conn: psycopg.Connection, source: str) -> int:
    """Queues every word whose meaning came from one particular place.

    The upgrade path, and the licence escape hatch. The seeded definitions are
    non-commercial; `--requeue-source freetalk` sends all of them back through
    Merriam-Webster and the model, which are licensed differently and write
    better sentences anyway. Same command replaces anything else that turns out
    to be a mistake.

    The old meaning stays until the new one lands, so nothing goes blank in
    front of a learner while the queue drains.
    """
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            """
            insert into gloss_jobs (word, context)
            select word, '' from glosses where source = %s
            on conflict (word) do nothing
            """,
            (source,),
        )
        return cur.rowcount


def queue_every_empty(conn: psycopg.Connection) -> int:
    """Queues every word in the cache that has no meaning, list or no list.

    The recovery path for turning a key on later. A glosser running with no
    source of meanings still answers taps — it writes the pronunciation and
    settles the word, because the alternative is a popup that spins for ever —
    and those words would otherwise stay meaningless after a key arrives, since
    nothing would ever ask about them again.

    Also picks up words nobody seeded: whatever learners tapped while the keys
    were off.
    """
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            """
            insert into gloss_jobs (word, context)
            select word, '' from glosses where meaning = ''
            on conflict (word) do nothing
            """
        )
        return cur.rowcount


def pending_meanings(conn: psycopg.Connection, words: list[str]) -> int:
    """How many of these words still have no meaning."""
    with conn.cursor() as cur:
        cur.execute(
            """
            select count(*) from unnest(%s::text[]) as w(word)
            where not exists (
                select 1 from glosses g where g.word = w.word and g.meaning <> ''
            )
            """,
            (words,),
        )
        return cur.fetchone()[0]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--meanings",
        action="store_true",
        help="also queue the meanings, which is the half that costs money",
    )
    parser.add_argument("--limit", type=int, help="seed only the most common N words")
    parser.add_argument("--words", type=Path, default=WORDS, help="a word list of your own")
    parser.add_argument(
        "--export", type=Path, metavar="FILE",
        help="write every finished gloss to a file, to be committed and imported elsewhere",
    )
    parser.add_argument(
        "--import", dest="import_from", type=Path, metavar="FILE",
        help="load a file written by --export, instead of asking anybody for anything",
    )
    parser.add_argument(
        "--requeue-source", metavar="SOURCE",
        help="queue every word whose meaning came from SOURCE, to replace it — "
             "`freetalk` is how to drop the non-commercial seeded definitions",
    )
    parser.add_argument(
        "--no-seed-file",
        action="store_true",
        help="skip the bundled definitions and leave every word to the sources",
    )
    parser.add_argument(
        "--requeue-empty",
        action="store_true",
        help="queue every word in the cache that has no meaning, not just the listed "
             "ones — what to run after turning a key on",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        log.error("DATABASE_URL is required")
        return 1

    words = load_words(args.words, args.limit)
    if not words and not (args.export or args.import_from or args.requeue_empty):
        log.error("%s has no words in it", args.words)
        return 1

    with psycopg.connect(dsn, autocommit=True) as conn:
        if args.export:
            written = export_glosses(conn, args.export)
            log.info("wrote %d glosses to %s", written, args.export)
            return 0

        if args.import_from:
            if not args.import_from.exists():
                log.error("%s does not exist", args.import_from)
                return 1
            loaded = import_glosses(conn, args.import_from)
            log.info("loaded %d glosses from %s", loaded, args.import_from)
            return 0

        if args.requeue_source:
            queued = queue_by_source(conn, args.requeue_source)
            log.info("queued %d words glossed from %s", queued, args.requeue_source)
            return 0

        if args.requeue_empty:
            queued = queue_every_empty(conn)
            log.info("queued %d words that had no meaning", queued)
            return 0

        said = fill_pronunciations(conn, words)
        log.info("%d of %d words have a pronunciation", said, len(words))

        # The free half of the meanings, read from the file rather than asked
        # for. Runs before anything is queued so that the words it covers are
        # never paid for.
        if not args.no_seed_file and SEED_GLOSSES.exists():
            loaded = import_glosses(conn, SEED_GLOSSES)
            log.info("%d definitions read from %s", loaded, SEED_GLOSSES.name)

        missing = pending_meanings(conn, words)
        if not missing:
            log.info("every one of them already has a meaning — nothing left to do")
            return 0

        if not args.meanings:
            log.info(
                "%d still have no meaning. Queue them with --meanings: free through "
                "Merriam-Webster at 1,000 a day, or about $%.2f in one go if the "
                "model answers all of them.",
                missing, missing * COST_PER_WORD_USD,
            )
            return 0

        depth = queue_meanings(conn, words)
        log.info(
            "queued %d words; %d jobs waiting. Run `python -m shadowline.glosser` "
            "to work through them.",
            missing, depth,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
