"""Claiming and finishing scoring jobs.

The queue is a Postgres table rather than a broker, and the reason is upstream:
the API writes a take and its job in one transaction, so there is no window
where a take exists with nothing scheduled to score it. ``for update skip
locked`` is what lets several workers poll the same table without blocking each
other or handing out the same job twice.

The SQL here has to stay in step with ``server/internal/store/jobs.go``; the Go
tests and ``tests/test_queue.py`` both exercise it against a real database.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import psycopg
from psycopg.rows import dict_row

# Kept identical to store.MaxAttempts and store.StaleAfter in the Go server.
MAX_ATTEMPTS = 3
STALE_AFTER = "5 minutes"


@dataclass
class Job:
    id: int
    take_id: str
    attempts: int
    clip_id: str
    take_audio_key: str
    clip_audio_key: str
    # The line the clip asks for, joined from its captions. What the take is
    # matched against — the words on screen, not the words in the clip's own
    # audio, because the caption is what the learner was told to say.
    line: str


def _line_of(captions: object) -> str:
    """The clip's captions as one line.

    A clip is one line to shadow, so this is almost always a single caption;
    joining covers the few that were cut with more than one.
    """
    if not isinstance(captions, list):
        return ""
    return " ".join(
        str(caption.get("text", "")).strip()
        for caption in captions
        if isinstance(caption, dict)
    ).strip()


class Queue:
    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    def claim(self) -> Job | None:
        """One job, marked running. None when the queue is empty."""
        with self.conn.transaction(), self.conn.cursor(row_factory=dict_row) as cur:
            # A take of a clip whose sound is still being cut waits for it: the
            # cutter makes a clip's sound on the server now, moments after it
            # is published, and a take recorded in those moments is scored
            # once it is there rather than never.
            cur.execute(
                """
                select j.id from scoring_jobs j
                join takes t on t.id = j.take_id
                join clips c on c.id = t.clip_id
                where ((j.state = 'queued')
                       or (j.state = 'running' and j.locked_at < now() - %s::interval))
                  and not (c.audio_key is null
                           and exists (select 1 from cut_jobs k where k.clip_id = c.id))
                order by j.created_at
                for update of j skip locked
                limit 1
                """,
                (STALE_AFTER,),
            )
            row = cur.fetchone()
            if row is None:
                return None

            cur.execute(
                """
                update scoring_jobs
                set state = 'running', attempts = attempts + 1, locked_at = now()
                from takes t, clips c
                where scoring_jobs.id = %s
                  and t.id = scoring_jobs.take_id
                  and c.id = t.clip_id
                returning scoring_jobs.id, scoring_jobs.take_id, scoring_jobs.attempts,
                          t.clip_id, t.audio_key as take_audio_key, c.audio_key as clip_audio_key,
                          c.captions
                """,
                (row["id"],),
            )
            claimed = cur.fetchone()
            if claimed is None:
                # The take or clip went away between the two statements — a
                # learner deleting a take mid-flight. Drop the job with it.
                cur.execute("delete from scoring_jobs where id = %s", (row["id"],))
                return None
            if claimed["clip_audio_key"] is None:
                # The sound it was waiting for never came: the cut gave up.
                # Nothing to score against, so the take is final unscored —
                # what a take of a clip with no sound has always been.
                cur.execute(
                    "update takes set status = 'scored' where id = %s", (claimed["take_id"],)
                )
                cur.execute("delete from scoring_jobs where id = %s", (claimed["id"],))
                return None
            return Job(
                id=claimed["id"],
                take_id=str(claimed["take_id"]),
                attempts=claimed["attempts"],
                clip_id=str(claimed["clip_id"]),
                take_audio_key=claimed["take_audio_key"],
                clip_audio_key=claimed["clip_audio_key"],
                line=_line_of(claimed["captions"]),
            )

    def complete(self, job: Job, score: int, scores: dict[str, int], analysis: dict) -> None:
        """Record the result and remove the job, both at once, so a take can
        never read as scored while its job is still queued."""
        with self.conn.transaction(), self.conn.cursor() as cur:
            cur.execute(
                """
                update takes
                set score = %s, scores = %s, analysis = %s, status = 'scored', error = null
                where id = %s
                """,
                (score, json.dumps(scores), json.dumps(analysis), job.take_id),
            )
            cur.execute("delete from scoring_jobs where id = %s", (job.id,))

    def fail(self, job: Job, reason: str) -> None:
        """Put the job back, or give up once it has had its attempts.

        Giving up matters as much as retrying: a take that can never be scored
        has to stop saying "measuring", or the Practice screen spins forever.
        """
        with self.conn.transaction(), self.conn.cursor() as cur:
            if job.attempts >= MAX_ATTEMPTS:
                cur.execute(
                    "update takes set status = 'failed', error = %s where id = %s",
                    (reason[:500], job.take_id),
                )
                cur.execute("delete from scoring_jobs where id = %s", (job.id,))
            else:
                cur.execute(
                    """
                    update scoring_jobs
                    set state = 'queued', locked_at = null, error = %s
                    where id = %s
                    """,
                    (reason[:500], job.id),
                )
