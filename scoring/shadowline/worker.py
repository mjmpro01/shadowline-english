"""The scoring worker.

Polls the job table, scores one take at a time, writes the result back. Nothing
here is clever: the whole design decision is upstream, in putting the queue in
Postgres so the job is written in the same transaction as the take.

Scale by running more replicas. One replica scores roughly one take a second,
and that — not message throughput — is the limit worth watching.
"""

from __future__ import annotations

import logging
import os
import signal
import sys
import time

import psycopg

from .analysis import build as build_analysis
from .audio import DecodeError, decode_to_mono
from .compare import compare_contours
from .pitch import ANALYSIS_RATE, track_pitch
from .queue import Job, Queue
from .storage import ObjectMissing, Storage, from_env as storage_from_env

log = logging.getLogger("shadowline.worker")

# How long to wait when the queue is empty. Short enough that a learner watching
# "Measuring your pitch…" does not notice, long enough not to hammer the
# database when nobody is practising.
IDLE_SLEEP = 1.0

# Ceiling on the wait between reconnection attempts.
MAX_BACKOFF = 30.0


class Unscoreable(Exception):
    """The take cannot be scored, and retrying will not change that."""


def score_job(job: Job, blobs: Storage) -> tuple[int, dict[str, int], dict]:
    try:
        clip_audio = blobs.get("clips", job.clip_audio_key)
        take_audio = blobs.get("takes", job.take_audio_key)
    except ObjectMissing as err:
        raise Unscoreable(f"recording is missing: {err}") from err

    try:
        reference = track_pitch(decode_to_mono(clip_audio), ANALYSIS_RATE)
        user = track_pitch(decode_to_mono(take_audio), ANALYSIS_RATE)
    except DecodeError as err:
        raise Unscoreable(f"could not read the recording: {err}") from err

    comparison = compare_contours(reference, user)
    if comparison is None:
        # Not a failure of the worker: there is genuinely nothing voiced to
        # measure, and inventing a score for it would be worse than saying so.
        raise Unscoreable("no speech found in the recording")

    return comparison.score, comparison.scores, build_analysis(comparison, user)


def run_once(queue: Queue, blobs: Storage) -> bool:
    """Scores one job. Returns False when the queue was empty."""
    job = queue.claim()
    if job is None:
        return False

    started = time.monotonic()
    try:
        score, scores, analysis = score_job(job, blobs)
    except Unscoreable as err:
        log.warning("take %s cannot be scored: %s", job.take_id, err)
        queue.fail(job, str(err))
        return True
    except Exception:
        # Unexpected: log the trace and let the job be retried, since the next
        # attempt may land on a worker that is not having this problem.
        log.exception("take %s failed unexpectedly", job.take_id)
        queue.fail(job, "scoring failed")
        return True

    queue.complete(job, score, scores, analysis)
    log.info(
        "scored take %s: %d (%.0fms)", job.take_id, score, (time.monotonic() - started) * 1000
    )
    return True


def main() -> int:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        log.error("DATABASE_URL is required")
        return 1

    blobs = storage_from_env()
    running = True

    def stop(*_: object) -> None:
        nonlocal running
        log.info("shutting down after the current job")
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    log.info("worker ready")
    backoff = 1.0
    while running:
        try:
            # autocommit so each transaction below is exactly the one it
            # declares; the claim must commit before the audio is fetched, or
            # the row stays locked for the length of the scoring.
            with psycopg.connect(dsn, autocommit=True) as conn:
                queue = Queue(conn)
                backoff = 1.0
                while running:
                    if not run_once(queue, blobs):
                        time.sleep(IDLE_SLEEP)
        # Every database error, not just a dropped connection. A restart, a lost
        # connection, or a schema that is not there yet should all be waited
        # out: dying here stops scoring until something restarts the worker, and
        # every take recorded meanwhile sits pending. Starting beside a server
        # that is still migrating is the ordinary way to meet the last of those.
        except psycopg.Error as err:
            if not running:
                break
            log.warning("database not ready (%s) — retrying in %.0fs", err, backoff)
            time.sleep(backoff)
            backoff = min(backoff * 2, MAX_BACKOFF)
    return 0


if __name__ == "__main__":
    sys.exit(main())
