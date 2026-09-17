"""The cutting worker.

Cuts each published clip's video out of the recording it was published from.
Separate from the scoring worker on purpose: a learner waits on a score, so its
latency is worth protecting, and a cut is an ffmpeg process that runs for
seconds while nobody waits on it.

Scale by running more replicas, the same as scoring. The limit here is ffmpeg
CPU.
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

from .cutqueue import CutJob, CutQueue
from .storage import ObjectMissing, Storage, from_env as storage_from_env
from .video import CutFailed, cut, ffmpeg_available, has_video_stream, poster

log = logging.getLogger("shadowline.cutter")

# Nothing is waiting on a cut, so an idle cutter can poll gently.
IDLE_SLEEP = 3.0
MAX_BACKOFF = 30.0


class Uncuttable(Exception):
    """The clip cannot be cut, and retrying will not change that."""


class SourceCache:
    """Keeps the last source downloaded, on disk.

    One upload becomes hundreds of clips, and jobs are claimed oldest first, so
    consecutive jobs nearly always want the same source. Without this the worker
    downloads a fifty-minute lecture once per line — the difference between
    cutting a batch in minutes and never finishing it.

    One entry is enough precisely because of that ordering. A larger cache would
    hold gigabytes to catch a case that barely arises.
    """

    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.key: str | None = None
        self.path: Path | None = None
        self.has_picture = False

    def fetch(self, blobs: Storage, key: str) -> Path:
        if self.key == key and self.path is not None and self.path.exists():
            return self.path
        self.discard()
        path = self.directory / ("source" + Path(key).suffix)
        blobs.download("clips", key, path)
        self.key, self.path = key, path
        # Probed once per source rather than once per clip: it is the same
        # answer every time, and ffprobe on a large file is not free.
        self.has_picture = has_video_stream(path)
        return path

    def discard(self) -> None:
        if self.path is not None:
            self.path.unlink(missing_ok=True)
        self.key, self.path, self.has_picture = None, None, False


def cut_job(job: CutJob, blobs: Storage, sources: SourceCache, workdir: Path) -> tuple[str, str]:
    """Cuts one clip and stores it. Returns the video and poster keys."""
    try:
        source = sources.fetch(blobs, job.source_key)
    except ObjectMissing as err:
        raise Uncuttable(f"source is missing: {err}") from err

    if not sources.has_picture:
        raise Uncuttable("the source has no video track")

    dest = workdir / f"{job.clip_id}.mp4"
    still = workdir / f"{job.clip_id}.jpg"
    try:
        cut(source, job.start, job.end, dest)
        video_key = f"clip/{job.clip_id}/{uuid.uuid4()}.mp4"
        blobs.put("clips", video_key, dest, "video/mp4")

        # A third of the way in rather than the first frame: a cut often opens
        # on the tail of a shot change, and the middle of a line is where the
        # speaker's face actually is.
        poster(source, job.start + (job.end - job.start) / 3, still)
        poster_key = f"clip/{job.clip_id}/{uuid.uuid4()}.jpg"
        blobs.put("clips", poster_key, still, "image/jpeg")

        return video_key, poster_key
    except CutFailed as err:
        raise Uncuttable(str(err)) from err
    finally:
        dest.unlink(missing_ok=True)
        still.unlink(missing_ok=True)


def run_once(queue: CutQueue, blobs: Storage, sources: SourceCache, workdir: Path) -> bool:
    """Cuts one clip. Returns False when the queue was empty."""
    job = queue.claim()
    if job is None:
        return False

    started = time.monotonic()
    try:
        video_key, poster_key = cut_job(job, blobs, sources, workdir)
    except Uncuttable as err:
        # The clip keeps its audio and simply has no picture, which is the state
        # every audio-only clip in the library is already in.
        log.warning("clip %s cannot be cut: %s", job.clip_id, err)
        queue.fail(job, str(err))
        return True
    except Exception:
        log.exception("clip %s failed unexpectedly", job.clip_id)
        queue.fail(job, "cutting failed")
        return True

    queue.complete(job, video_key, poster_key)
    log.info("cut clip %s (%.0fms)", job.clip_id, (time.monotonic() - started) * 1000)
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
        # Refusing to start beats claiming jobs and failing every one of them
        # until each has burned its three attempts.
        log.error("ffmpeg is not installed — the cutter cannot do anything without it")
        return 1

    blobs = storage_from_env()
    running = True

    def stop(*_: object) -> None:
        nonlocal running
        log.info("shutting down after the current cut")
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    with tempfile.TemporaryDirectory(prefix="shadowline-cutter-") as tmp:
        workdir = Path(tmp)
        sources = SourceCache(workdir)
        log.info("cutter ready")
        backoff = 1.0
        while running:
            try:
                # autocommit for the same reason the scoring worker uses it: the
                # claim has to commit before the cut starts, or the row stays
                # locked for the length of an ffmpeg run.
                with psycopg.connect(dsn, autocommit=True) as conn:
                    queue = CutQueue(conn)
                    backoff = 1.0
                    while running:
                        if not run_once(queue, blobs, sources, workdir):
                            time.sleep(IDLE_SLEEP)
            # Every database error, not just a dropped connection. A worker
            # started beside a server that has not finished migrating finds no
            # cut_jobs table yet, and dying there means it never comes back —
            # the queue fills up and nothing ever cuts anything.
            except psycopg.Error as err:
                if not running:
                    break
                log.warning("database not ready (%s) — retrying in %.0fs", err, backoff)
                time.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF)
    return 0


if __name__ == "__main__":
    sys.exit(main())
