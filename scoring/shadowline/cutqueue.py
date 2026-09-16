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
                          c.start_seconds, c.end_seconds
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
            )

    def complete(self, job: CutJob, video_key: str) -> None:
        """Record the key and remove the job at once, so a clip never reads as
        having a video while its job is still queued."""
        with self.conn.transaction(), self.conn.cursor() as cur:
            cur.execute("update clips set video_key = %s where id = %s", (video_key, job.clip_id))
            cur.execute("delete from cut_jobs where id = %s", (job.id,))

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
