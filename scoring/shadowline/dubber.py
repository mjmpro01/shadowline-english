"""The dubbing worker.

Muxes a learner's recording onto the clip's picture, so a dub is a file they can
keep and send rather than only something the Dub Review screen can play back.

Its own worker rather than a second job kind on the cutter: this is the one
piece of queued work somebody is sitting in front of waiting for, and a batch of
cuts running ahead of it would make them wait minutes for sub-second work.
"""

from __future__ import annotations

import logging
import os
import signal
import sys
import tempfile
import time
import uuid
from pathlib import Path

import psycopg

from .dubqueue import DubJob, DubQueue
from .storage import ObjectMissing, Storage, from_env as storage_from_env
from .video import CutFailed, dub, ffmpeg_available

log = logging.getLogger("shadowline.dubber")

# Short, because a learner is waiting: a dub requested the moment a take is
# recorded should be there by the time they have finished reading the score.
IDLE_SLEEP = 0.5
MAX_BACKOFF = 30.0


class Undubbable(Exception):
    """The take cannot be dubbed, and retrying will not change that."""


def dub_job(job: DubJob, blobs: Storage, workdir: Path) -> str:
    """Muxes one take onto its clip and stores it. Returns the key."""
    picture = workdir / f"{job.take_id}-clip{Path(job.video_key).suffix}"
    voice = workdir / f"{job.take_id}-voice{Path(job.voice_key).suffix}"
    dest = workdir / f"{job.take_id}.mp4"

    try:
        blobs.download("clips", job.video_key, picture)
        blobs.download("takes", job.voice_key, voice)
    except ObjectMissing as err:
        raise Undubbable(f"recording is missing: {err}") from err

    try:
        dub(picture, voice, dest)
        key = f"dub/{job.take_id}/{uuid.uuid4()}.mp4"
        blobs.put("takes", key, dest, "video/mp4")
        return key
    except CutFailed as err:
        raise Undubbable(str(err)) from err
    finally:
        for path in (picture, voice, dest):
            path.unlink(missing_ok=True)


def run_once(queue: DubQueue, blobs: Storage, workdir: Path) -> bool:
    """Dubs one take. Returns False when the queue was empty."""
    job = queue.claim()
    if job is None:
        return False

    started = time.monotonic()
    try:
        key = dub_job(job, blobs, workdir)
    except Undubbable as err:
        # The take keeps its recording and its score; only the file is missing,
        # and the screen offers the button again rather than spinning.
        log.warning("take %s cannot be dubbed: %s", job.take_id, err)
        queue.fail(job, str(err))
        return True
    except Exception:
        log.exception("take %s failed unexpectedly", job.take_id)
        queue.fail(job, "dubbing failed")
        return True

    queue.complete(job, key)
    log.info("dubbed take %s (%.0fms)", job.take_id, (time.monotonic() - started) * 1000)
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
    if not ffmpeg_available():
        log.error("ffmpeg is not installed — the dubber cannot do anything without it")
        return 1

    blobs = storage_from_env()
    running = True

    def stop(*_: object) -> None:
        nonlocal running
        log.info("shutting down after the current dub")
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    with tempfile.TemporaryDirectory(prefix="shadowline-dubber-") as tmp:
        workdir = Path(tmp)
        log.info("dubber ready")
        backoff = 1.0
        while running:
            try:
                with psycopg.connect(dsn, autocommit=True) as conn:
                    queue = DubQueue(conn)
                    backoff = 1.0
                    while running:
                        if not run_once(queue, blobs, workdir):
                            time.sleep(IDLE_SLEEP)
            # Every database error, not just a dropped connection: a worker
            # started beside a server still migrating finds no table yet, and
            # dying there means it never comes back.
            except psycopg.Error as err:
                if not running:
                    break
                log.warning("database not ready (%s) — retrying in %.0fs", err, backoff)
                time.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF)
    return 0


if __name__ == "__main__":
    sys.exit(main())
