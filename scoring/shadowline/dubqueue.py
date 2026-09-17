"""Claiming and finishing dub jobs.

The fourth queue, and the only one a learner is watching a spinner for: a cut
and a transcript happen while an admin gets on with something else, but a dub is
asked for by name and waited on. That is why it has its own worker rather than
queueing behind a batch of cuts.

The SQL has to stay in step with the schema in ``00005_take_dub.sql``.
"""

from __future__ import annotations

from dataclasses import dataclass

import psycopg
from psycopg.rows import dict_row

MAX_ATTEMPTS = 3
# Muxing is sub-second work — copying one stream and encoding a few seconds of
# speech — so five minutes only ever catches a worker that died.
STALE_AFTER = "5 minutes"


@dataclass
class DubJob:
    id: int
    take_id: str
    attempts: int
    video_key: str
    voice_key: str


class DubQueue:
    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    def claim(self) -> DubJob | None:
        """One job, marked running. None when the queue is empty."""
        with self.conn.transaction(), self.conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                select id from dub_jobs
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
                update dub_jobs
                set state = 'running', attempts = attempts + 1, locked_at = now()
                from takes t, clips c
                where dub_jobs.id = %s
                  and t.id = dub_jobs.take_id
                  and c.id = t.clip_id
                  and c.video_key is not null
                  and t.audio_key is not null
                returning dub_jobs.id, dub_jobs.take_id, dub_jobs.attempts,
                          c.video_key, t.audio_key as voice_key
                """,
                (row["id"],),
            )
            claimed = cur.fetchone()
            if claimed is None:
                # The take, the clip or its video went away between the two
                # statements — a learner deleting a take mid-flight. Drop the
                # job with it rather than retrying something that cannot work.
                cur.execute("delete from dub_jobs where id = %s", (row["id"],))
                return None
            return DubJob(
                id=claimed["id"],
                take_id=str(claimed["take_id"]),
                attempts=claimed["attempts"],
                video_key=claimed["video_key"],
                voice_key=claimed["voice_key"],
            )

    def complete(self, job: DubJob, dub_key: str) -> None:
        """Record the key and remove the job at once, so a take never reads as
        having a dub while its job is still queued."""
        with self.conn.transaction(), self.conn.cursor() as cur:
            cur.execute("update takes set dub_key = %s where id = %s", (dub_key, job.take_id))
            cur.execute("delete from dub_jobs where id = %s", (job.id,))

    def fail(self, job: DubJob, reason: str) -> None:
        """Put the job back, or give up once it has had its attempts.

        Giving up deletes the job, which is what stops the screen waiting: with
        no dub and no job the take reports "none", and the button is offered
        again rather than spinning for ever.
        """
        with self.conn.transaction(), self.conn.cursor() as cur:
            if job.attempts >= MAX_ATTEMPTS:
                cur.execute("delete from dub_jobs where id = %s", (job.id,))
            else:
                cur.execute(
                    """
                    update dub_jobs
                    set state = 'queued', locked_at = null, error = %s
                    where id = %s
                    """,
                    (reason[:500], job.id),
                )
