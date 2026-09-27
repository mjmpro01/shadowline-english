"""Claiming and finishing cut jobs.

Same shape as ``queue.py`` and deliberately separate from it. A learner waits on
a score, so scoring latency is worth protecting; nobody waits on a cut, and one
cut is an ffmpeg process that runs for seconds. Sharing a queue would put a
batch of cuts in front of the score somebody is watching for.

The SQL has to stay in step with ``server/internal/store/cutjobs.go`` and the
schema in ``00002_clip_video.sql``.
"""

from __future__ import annotations

from dataclasses import dataclass

import psycopg
from psycopg.rows import dict_row

# Three attempts covers a worker dying mid-cut. Beyond that the source is
# genuinely unreadable and retrying only burns CPU.
MAX_ATTEMPTS = 3
# Longer than the scoring queue's five minutes: a cut of a large source can
# legitimately take a while, and reclaiming it early would run it twice.
STALE_AFTER = "20 minutes"


@dataclass
class CutJob:
    id: int
    clip_id: str
    attempts: int
    source_key: str
    content_type: str
    start: float
    end: float
    # What the clip is still missing. Its sound is cut here now, not uploaded;
    # a clip published by an older studio arrives with it already.
    needs_audio: bool = True
    needs_video: bool = True


class CutQueue:
    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    def claim(self) -> CutJob | None:
        """One job, marked running. None when the queue is empty."""
        with self.conn.transaction(), self.conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                select id from cut_jobs
                where (state = 'queued')
                   or (state = 'running' and locked_at < now() - %s::interval)
                order by created_at
                for update skip locked
                limit 1
                """,
                (STALE_AFTER,),
            )
            row = cur.fetchone()
            if row is None:
                return None

            cur.execute(
                """
                update cut_jobs
                set state = 'running', attempts = attempts + 1, locked_at = now()
                from clips c, clip_sources s
                where cut_jobs.id = %s
                  and c.id = cut_jobs.clip_id
                  and s.id = c.source_id
                returning cut_jobs.id, cut_jobs.clip_id, cut_jobs.attempts,
                          s.key as source_key, s.content_type,
                          c.start_seconds, c.end_seconds,
                          c.audio_key is null as needs_audio,
                          c.video_key is null as needs_video
                """,
                (row["id"],),
            )
            claimed = cur.fetchone()
            if claimed is None:
                # The clip or its source went away between the two statements —
                # an admin deleting a clip mid-flight. Drop the job with it.
                cur.execute("delete from cut_jobs where id = %s", (row["id"],))
                return None
            return CutJob(
                id=claimed["id"],
                clip_id=str(claimed["clip_id"]),
                attempts=claimed["attempts"],
                source_key=claimed["source_key"],
                content_type=claimed["content_type"],
                start=claimed["start_seconds"],
                end=claimed["end_seconds"],
                needs_audio=claimed["needs_audio"],
                needs_video=claimed["needs_video"],
            )

    def record(self, job: CutJob, video_key: str | None, poster_key: str | None,
               audio_key: str | None) -> None:
        """Write down what a cut produced, leaving whatever it did not produce as
        it was. An uploaded sound is never replaced by a cut one."""
        self.conn.execute(
            """
            update clips set video_key = coalesce(%s, video_key),
                             poster_key = coalesce(%s, poster_key),
                             audio_key = coalesce(audio_key, %s)
            where id = %s
            """,
            (video_key, poster_key, audio_key, job.clip_id),
        )

    def complete(self, job: CutJob, video_key: str | None, poster_key: str | None,
                 audio_key: str | None = None) -> None:
        """Record the keys and remove the job at once, so a clip never reads as
        having its sound or picture while its job is still queued."""
        with self.conn.transaction():
            self.record(job, video_key, poster_key, audio_key)
            self.conn.execute("delete from cut_jobs where id = %s", (job.id,))

    def fail(self, job: CutJob, reason: str) -> None:
        """Put the job back, or give up once it has had its attempts.

        Giving up costs the clip its picture and nothing else: video_key stays
        null, and every screen already handles a clip that has no video, because
        that is what every audio upload is.
        """
        with self.conn.transaction(), self.conn.cursor() as cur:
            if job.attempts >= MAX_ATTEMPTS:
                cur.execute("delete from cut_jobs where id = %s", (job.id,))
            else:
                cur.execute(
                    """
                    update cut_jobs
                    set state = 'queued', locked_at = null, error = %s
                    where id = %s
                    """,
                    (reason[:500], job.id),
                )
