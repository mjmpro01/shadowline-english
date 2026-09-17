"""The word-lookup worker.

Answers "what does this word mean" for any word in the app, which until now
only fifteen words had an answer to.

Runs without an API key, deliberately. With one, a tapped word comes back with
a pronunciation and a definition; without one, it comes back with a
pronunciation and no definition, because CMUdict is free and the model is not.
Nothing in the app breaks either way — the popup shows what it was given.
"""

from __future__ import annotations

import logging
import os
import signal
import sys
import time

import psycopg

from .gloss import ClaudeGlosser, Glosser, GlossFailed, gloss
from .glossqueue import GlossQueue

log = logging.getLogger("shadowline.glosser")

# Short, because a learner has tapped a word and the popup is waiting: the poll
# is most of what they feel, the API call is the rest.
IDLE_SLEEP = 0.25
MAX_BACKOFF = 30.0


def run_once(queue: GlossQueue, glosser: Glosser | None) -> bool:
    """Looks one word up. Returns False when the queue was empty."""
    job = queue.claim()
    if job is None:
        return False

    started = time.monotonic()
    try:
        said, meaning = gloss(job.word, job.context, glosser)
    except GlossFailed as err:
        # The word keeps its place in the learner's list; only the definition
        # is missing, and the popup says so rather than spinning.
        log.warning("cannot gloss %r: %s", job.word, err)
        queue.fail(job, str(err))
        return True
    except Exception:
        log.exception("glossing %r failed unexpectedly", job.word)
        queue.fail(job, "lookup failed")
        return True

    queue.complete(job, said, meaning)
    log.info("glossed %r (%.0fms)", job.word, (time.monotonic() - started) * 1000)
    return True


def _glosser() -> Glosser | None:
    """The model client, or None when there is no key to use one with.

    Starting anyway rather than exiting: a deployment that has not been given a
    key still wants pronunciations, and a worker that refuses to run leaves
    every tapped word queued for ever.
    """
    if not os.environ.get("ANTHROPIC_API_KEY"):
        log.warning(
            "ANTHROPIC_API_KEY is not set — words will get a pronunciation and no meaning"
        )
        return None
    try:
        return ClaudeGlosser()
    # Broadly, because every way this can fail — the package not installed, a
    # key the client rejects out of hand — is a reason to run without meanings
    # rather than a reason not to run. A worker that refuses to start leaves
    # every tapped word queued for ever.
    except Exception as err:
        log.warning("no definitions this run (%s) — pronunciations only", err)
        return None


def main() -> int:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        log.error("DATABASE_URL is required")
        return 1

    glosser = _glosser()
    running = True

    def stop(*_: object) -> None:
        nonlocal running
        log.info("shutting down after the current lookup")
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    log.info("glosser ready")
    backoff = 1.0
    while running:
        try:
            with psycopg.connect(dsn, autocommit=True) as conn:
                queue = GlossQueue(conn)
                backoff = 1.0
                while running:
                    if not run_once(queue, glosser):
                        time.sleep(IDLE_SLEEP)
        # Every database error, not just a dropped connection: a worker started
        # beside a server still migrating finds no table yet, and dying there
        # means it never comes back.
        except psycopg.Error as err:
            if not running:
                break
            log.warning("database not ready (%s) — retrying in %.0fs", err, backoff)
            time.sleep(backoff)
            backoff = min(backoff * 2, MAX_BACKOFF)
    return 0


if __name__ == "__main__":
    sys.exit(main())
