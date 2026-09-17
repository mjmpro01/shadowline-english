"""Claiming and finishing transcription jobs.

The third queue, and separate for the same reason the second one is: a learner
waits on a score in seconds, nobody waits on a cut, and transcribing an hour of
speech is minutes of CPU with an admin watching the studio fill in. Three
pressures, three workers, scaled apart.

The SQL has to stay in step with the schema in ``00003_transcripts.sql``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import psycopg
from psycopg.rows import dict_row

MAX_ATTEMPTS = 3
# Longer than cutting's twenty minutes: a long recording legitimately takes
# that, and reclaiming it early would transcribe the same file twice.
STALE_AFTER = "90 minutes"


@dataclass
class TranscribeJob:
    id: int
    source_id: str
    attempts: int
    source_key: str


class TranscribeQueue:
    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    def claim(self) -> TranscribeJob | None:
        """One job, marked running. None when the queue is empty."""
        with self.conn.transaction(), self.conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                select id from transcribe_jobs
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
                update transcribe_jobs
                set state = 'running', attempts = attempts + 1, locked_at = now()
                from clip_sources s
                where transcribe_jobs.id = %s and s.id = transcribe_jobs.source_id
                returning transcribe_jobs.id, transcribe_jobs.source_id,
                          transcribe_jobs.attempts, s.key as source_key
                """,
                (row["id"],),
            )
            claimed = cur.fetchone()
            if claimed is None:
                # The source went away between the two statements. Drop the job
                # with it rather than leaving it to be claimed for ever.
                cur.execute("delete from transcribe_jobs where id = %s", (row["id"],))
                return None
            return TranscribeJob(
                id=claimed["id"],
                source_id=str(claimed["source_id"]),
                attempts=claimed["attempts"],
                source_key=claimed["source_key"],
            )

    def complete(self, job: TranscribeJob, language: str, words: list[dict]) -> None:
        """Store the transcript and remove the job at once, so the studio never
        reads a source as still pending when its words are already there."""
        with self.conn.transaction(), self.conn.cursor() as cur:
            cur.execute(
                """
                insert into transcripts (source_id, words, language)
                values (%s, %s, %s)
                on conflict (source_id) do update set words = excluded.words,
                                                      language = excluded.language
                """,
                (job.source_id, json.dumps(words), language),
            )
            cur.execute("delete from transcribe_jobs where id = %s", (job.id,))

    def fail(self, job: TranscribeJob, reason: str) -> None:
        """Put the job back, or give up once it has had its attempts.

        Giving up deletes the job, which is what makes the studio stop saying
        the words are coming: with no transcript and no job, the source reports
        failed and the admin types the lines as they always did.
        """
        with self.conn.transaction(), self.conn.cursor() as cur:
            if job.attempts >= MAX_ATTEMPTS:
                cur.execute("delete from transcribe_jobs where id = %s", (job.id,))
            else:
                cur.execute(
                    """
                    update transcribe_jobs
                    set state = 'queued', locked_at = null, error = %s
                    where id = %s
                    """,
                    (reason[:500], job.id),
                )
