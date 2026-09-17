"""Claiming and finishing gloss jobs.

The fifth queue. Like the dubber, somebody is watching for the answer — a
learner has tapped a word and a popup is waiting on it — so it gets its own
worker rather than queueing behind a batch of cuts.

Unlike every other queue, the work is one API call: no file to download, no
ffmpeg, nothing on disk. What it costs is money rather than CPU, which is why a
finished gloss is kept for ever and never looked up twice.

The SQL has to stay in step with the schema in ``00006_glosses.sql``.
"""

from __future__ import annotations

from dataclasses import dataclass

import psycopg
from psycopg.rows import dict_row

MAX_ATTEMPTS = 3
# One API call with a hundred-token ceiling. A minute only ever catches a
# worker that died holding the job.
STALE_AFTER = "1 minute"


@dataclass
class GlossJob:
    id: int
    word: str
    context: str
    attempts: int


class GlossQueue:
    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    def claim(self) -> GlossJob | None:
        """One job, marked running. None when the queue is empty."""
        with self.conn.transaction(), self.conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                select id from gloss_jobs
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
                update gloss_jobs
                set state = 'running', attempts = attempts + 1, locked_at = now()
                where id = %s
                returning id, word, context, attempts
                """,
                (row["id"],),
            )
            claimed = cur.fetchone()
            if claimed is None:
                return None
            return GlossJob(
                id=claimed["id"],
                word=claimed["word"],
                context=claimed["context"],
                attempts=claimed["attempts"],
            )

    def complete(self, job: GlossJob, said: str, meaning: str) -> None:
        """Write the gloss and drop the job at once, so a word is never both
        looked up and still queued."""
        with self.conn.transaction(), self.conn.cursor() as cur:
            cur.execute(
                """
                insert into glosses (word, ipa, meaning) values (%s, %s, %s)
                on conflict (word) do update
                set ipa = excluded.ipa, meaning = excluded.meaning
                """,
                (job.word, said, meaning),
            )
            cur.execute("delete from gloss_jobs where id = %s", (job.id,))

    def fail(self, job: GlossJob, reason: str) -> None:
        """Put the job back, or give up once it has had its attempts.

        Giving up deletes the job, which is what stops the popup waiting: with
        no gloss and no job the word reports "none", and the learner is shown
        the word itself rather than a spinner that never resolves.
        """
        with self.conn.transaction(), self.conn.cursor() as cur:
            if job.attempts >= MAX_ATTEMPTS:
                cur.execute("delete from gloss_jobs where id = %s", (job.id,))
            else:
                cur.execute(
                    """
                    update gloss_jobs
                    set state = 'queued', locked_at = null, error = %s
                    where id = %s
                    """,
                    (reason[:500], job.id),
                )
