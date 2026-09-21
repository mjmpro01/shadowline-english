"""The word-lookup worker.

Answers "what does this word mean" for any word in the app, which until now
only fifteen words had an answer to.

Meanings are asked for in order, cheapest first: Merriam-Webster's Learner's
Dictionary, then the Claude API for the words it has no entry for. Both are
optional and the worker says at startup which ones it has. With neither, a word
still comes back with its pronunciation from CMUdict, because that is free and
offline. Nothing in the app breaks at any of these settings — the popup shows
what it was given.
"""

from __future__ import annotations

import logging
import os
import signal
import sys
import time

import psycopg

from .dictionary import LearnersDictionary
from .gloss import ClaudeGlosser, Glosser, GlossFailed, gloss
from .glossqueue import GlossQueue
from . import telemetry

log = logging.getLogger("shadowline.glosser")

# Short, because a learner has tapped a word and the popup is waiting: the poll
# is most of what they feel, the API call is the rest.
IDLE_SLEEP = 0.25
MAX_BACKOFF = 30.0


def run_once(queue: GlossQueue, sources: list[Glosser]) -> bool:
    """Looks one word up. Returns False when the queue was empty."""
    job = queue.claim()
    if job is None:
        return False

    started = time.monotonic()
    with telemetry.track_job(
        "glossing",
        {"job.type": "gloss", "word": job.word},
    ) as traced:
        try:
            said, meaning, source = gloss(job.word, job.context, sources)
        except GlossFailed as err:
            traced["status"] = "rejected"
            # The word keeps its place in the learner's list; only the definition
            # is missing, and the popup says so rather than spinning.
            log.warning("cannot gloss %r: %s", job.word, err)
            queue.fail(job, str(err))
            return True
        except Exception:
            traced["status"] = "error"
            log.exception("glossing %r failed unexpectedly", job.word)
            queue.fail(job, "lookup failed")
            return True

        queue.complete(job, said, meaning, source)
        log.info(
            "glossed %r from %s (%.0fms)",
            job.word, source or "nowhere", (time.monotonic() - started) * 1000,
        )
        return True


def _sources() -> list[Glosser]:
    """Where meanings come from, cheapest first.

    Every source is optional and a missing one is announced rather than fatal:
    a deployment given neither key still wants pronunciations, and a worker
    that refuses to start leaves every tapped word queued for ever.
    """
    sources: list[Glosser] = []

    key = os.environ.get("DICTIONARY_API_KEY", "").strip()
    if key:
        sources.append(LearnersDictionary(key))
    else:
        log.info("DICTIONARY_API_KEY is not set — no dictionary in front of the model")

    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            sources.append(ClaudeGlosser())
        # Broadly, because every way this can fail — the package not installed,
        # a key rejected out of hand — is a reason to run with one source fewer
        # rather than a reason not to run.
        except Exception as err:
            log.warning("the model is unavailable this run (%s)", err)
    else:
        log.info("ANTHROPIC_API_KEY is not set — no meanings for words the dictionary lacks")

    if not sources:
        log.warning(
            "no source of meanings configured — words get a pronunciation only. "
            "Words looked up now keep an empty meaning after a key is added; "
            "`python -m shadowline.seedwords --requeue-empty` is what fixes that."
        )
    return sources


def main() -> int:
    telemetry.setup("shadowline-glossing")

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        log.error("DATABASE_URL is required")
        return 1

    sources = _sources()
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
                    if not run_once(queue, sources):
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
