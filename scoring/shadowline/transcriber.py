"""The transcription worker.

Runs Whisper over each uploaded recording and stores the words with their times
and their IPA. The studio polls for them and fills in the lines, so the admin
corrects a transcript instead of typing one.

One run per upload, not per clip: every clip cut from a recording reads the
words falling inside its own boundaries, so transcribing an hour once serves
however many lines come out of it.
"""

from __future__ import annotations

import logging
import os
import signal
import sys
import tempfile
import time
from pathlib import Path

import psycopg

from . import ipa
from . import telemetry
from .storage import ObjectMissing, Storage, from_env as storage_from_env
from .transcribe import TranscribeFailed, Transcriber, WhisperTranscriber
from .transcribequeue import TranscribeJob, TranscribeQueue

log = logging.getLogger("shadowline.transcriber")

# Nobody is blocked on a transcript arriving in any particular second, and a run
# is minutes long, so polling can be gentle.
IDLE_SLEEP = 3.0
MAX_BACKOFF = 30.0


class Untranscribable(Exception):
    """The recording cannot be transcribed, and retrying will not change that."""


def transcribe_job(
    job: TranscribeJob, blobs: Storage, transcriber: Transcriber, workdir: Path
) -> tuple[str, list[dict]]:
    """Transcribes one source. Returns its language and words, IPA included."""
    path = workdir / ("source" + Path(job.source_key).suffix)
    try:
        blobs.download("clips", job.source_key, path)
    except ObjectMissing as err:
        raise Untranscribable(f"source is missing: {err}") from err

    try:
        result = transcriber.transcribe(path)
    except TranscribeFailed as err:
        raise Untranscribable(str(err)) from err
    finally:
        path.unlink(missing_ok=True)

    # IPA is looked up here rather than in the browser: it is a dictionary of a
    # hundred thousand entries, and shipping it to every admin to save one join
    # would be a strange trade.
    return result.language, [
        {"start": word.start, "end": word.end, "text": word.text, "ipa": ipa.for_word(word.text)}
        for word in result.words
    ]


def run_once(
    queue: TranscribeQueue, blobs: Storage, transcriber: Transcriber, workdir: Path
) -> bool:
    """Transcribes one source. Returns False when the queue was empty."""
    job = queue.claim()
    if job is None:
        return False

    started = time.monotonic()
    with telemetry.track_job(
        "transcribing",
        {"job.type": "transcribe", "source_id": str(job.source_id)},
    ) as traced:
        try:
            language, words = transcribe_job(job, blobs, transcriber, workdir)
        except Untranscribable as err:
            traced["status"] = "rejected"
            # The studio falls back to what it always did: the admin types the
            # lines. Nothing else about the upload is affected.
            log.warning("source %s cannot be transcribed: %s", job.source_id, err)
            queue.fail(job, str(err))
            return True
        except Exception:
            traced["status"] = "error"
            log.exception("source %s failed unexpectedly", job.source_id)
            queue.fail(job, "transcription failed")
            return True

        queue.complete(job, language, words)
        log.info(
            "transcribed source %s: %d words (%.0fs)",
            job.source_id,
            len(words),
            time.monotonic() - started,
        )
        return True


def main() -> int:
    telemetry.setup("shadowline-transcribing")

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        log.error("DATABASE_URL is required")
        return 1

    blobs = storage_from_env()
    transcriber = WhisperTranscriber()
    running = True

    def stop(*_: object) -> None:
        nonlocal running
        log.info("shutting down after the current recording")
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    with tempfile.TemporaryDirectory(prefix="shadowline-transcriber-") as tmp:
        workdir = Path(tmp)
        log.info("transcriber ready")
        backoff = 1.0
        while running:
            try:
                with psycopg.connect(dsn, autocommit=True) as conn:
                    queue = TranscribeQueue(conn)
                    backoff = 1.0
                    while running:
                        if not run_once(queue, blobs, transcriber, workdir):
                            time.sleep(IDLE_SLEEP)
            # Every database error, not just a dropped connection: a worker
            # started beside a server that has not finished migrating finds no
            # table yet, and dying there means it never comes back.
            except psycopg.Error as err:
                if not running:
                    break
                log.warning("database not ready (%s) — retrying in %.0fs", err, backoff)
                time.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF)
    return 0


if __name__ == "__main__":
    sys.exit(main())
