"""Claiming and finishing downloads of recordings an admin gave a link to.

The fourth queue, worked by the transcribing worker: everything it downloads
is transcribed next anyway, and a short video is seconds of network against
minutes of Whisper.

The SQL has to stay in step with the schema in ``00024_fetch_from_link.sql``.
"""

from __future__ import annotations

from dataclasses import dataclass

import psycopg
from psycopg.rows import dict_row

MAX_ATTEMPTS = 3
# A short downloads in seconds; a running job this old belonged to a worker
# that died with it.
STALE_AFTER = "30 minutes"


@dataclass
class FetchJob:
    id: int
    source_id: str
    url: str
    attempts: int


@dataclass
class Stored:
    """What the worker learned about a recording it downloaded and stored."""

    key: str
    content_type: str
    bytes: int
    seconds: float
    title: str
    credit: str


class FetchQueue:
    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    def claim(self) -> FetchJob | None:
        """One job, marked running. None when the queue is empty."""
        with self.conn.transaction(), self.conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                update fetch_jobs
                set state = 'running', attempts = attempts + 1, locked_at = now()
                where id = (
                    select id from fetch_jobs
                    where (state = 'queued')
                       or (state = 'running' and locked_at < now() - %s::interval)
                    order by created_at
                    for update skip locked
                    limit 1
                )
                returning id, source_id, url, attempts
                """,
                (STALE_AFTER,),
            )
            row = cur.fetchone()
            if row is None:
                return None
            return FetchJob(
                id=row["id"], source_id=str(row["source_id"]), url=row["url"], attempts=row["attempts"]
            )

    def complete(self, job: FetchJob, stored: Stored) -> bool:
        """Point the row at the stored file, queue its transcription and drop the
        download, at once: a stored recording with nothing queued to read it
        would leave the studio waiting for words that were never coming.

        The video's own title replaces the link standing in for a name, and
        only that: a name the admin typed is kept.

        False when the row is gone or no longer waiting — deleted while the
        download ran — and the caller takes the file back out.
        """
        with self.conn.transaction(), self.conn.cursor() as cur:
            cur.execute(
                """
                update clip_sources
                set key = %(key)s, upload_state = 'stored', error = '',
                    content_type = %(content_type)s, bytes = %(bytes)s,
                    duration_seconds = %(seconds)s, source_credit = %(credit)s,
                    name = case when name = source_url and %(title)s <> '' then %(title)s else name end,
                    title = case when title = source_url and %(title)s <> '' then %(title)s else title end
                where id = %(id)s and upload_state = 'fetching'
                """,
                {
                    "id": job.source_id,
                    "key": stored.key,
                    "content_type": stored.content_type,
                    "bytes": stored.bytes,
                    "seconds": stored.seconds,
                    "credit": stored.credit[:200],
                    "title": stored.title[:200],
                },
            )
            kept = cur.rowcount == 1
            if kept:
                cur.execute(
                    "insert into transcribe_jobs (source_id) values (%s) on conflict (source_id) do nothing",
                    (job.source_id,),
                )
            cur.execute("delete from fetch_jobs where id = %s", (job.id,))
            return kept

    def fail(self, job: FetchJob, reason: str, *, permanent: bool = False) -> None:
        """Put the job back, or give up: once it has had its attempts, or at once
        for a video that will not download however often it is asked for —
        private, removed, from a site the downloader does not know.

        Giving up marks the job 'failed', keeping the reason, and the upload
        'failed' with the same words, which is what the history and the studio
        show. A retry from the console puts both back.
        """
        reason = reason[:500]
        with self.conn.transaction(), self.conn.cursor() as cur:
            if permanent or job.attempts >= MAX_ATTEMPTS:
                cur.execute(
                    "update fetch_jobs set state = 'failed', locked_at = null, error = %s where id = %s",
                    (reason, job.id),
                )
                cur.execute(
                    """
                    update clip_sources set upload_state = 'failed', error = %s
                    where id = %s and upload_state = 'fetching'
                    """,
                    (reason, job.source_id),
                )
            else:
                cur.execute(
                    "update fetch_jobs set state = 'queued', locked_at = null, error = %s where id = %s",
                    (reason, job.id),
                )
