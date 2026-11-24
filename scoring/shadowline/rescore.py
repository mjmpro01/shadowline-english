"""Marking takes scored under older rules again.

When the marking changes, a learner's history should not have a step in it:
yesterday's 60 and today's 82 for the same delivery would read as progress that
never happened. Every take keeps what was measured — the four metrics, and what
the transcriber heard against the caption — so a take can be marked again from
its own row, without its recording and without the transcriber. That is cheap
enough to do for the whole history in the background.

`takes.scoring_version` says which rules marked a take. The worker calls
`rescore_batch` whenever the queue is empty, so new takes always come first and
the backlog drains on its own after a deploy; `for update skip locked` lets
several replicas share it without marking a take twice.
"""

from __future__ import annotations

import json
import logging

import psycopg
from psycopg.rows import dict_row

from .compare import METRIC_NAMES
from .ease import SCORING_VERSION, mark
from .words import recheck

log = logging.getLogger("shadowline.rescore")

BATCH = 200


def _measured(row: dict) -> dict[str, int] | None:
    """The four raw metrics of a take, or None when it has none to mark.

    A take marked by these rules keeps them under `analysis.raw`; one from
    before kept them, raw, as its `scores`.
    """
    analysis = row["analysis"] if isinstance(row["analysis"], dict) else {}
    raw = analysis.get("raw")
    source = raw.get("scores") if isinstance(raw, dict) else row["scores"]
    if not isinstance(source, dict):
        return None
    try:
        return {name: int(round(float(source[name]))) for name in METRIC_NAMES}
    except (KeyError, TypeError, ValueError):
        return None


def rescore_batch(conn: psycopg.Connection, limit: int = BATCH) -> int:
    """Marks up to `limit` older takes with today's rules. Returns how many."""
    with conn.transaction(), conn.cursor(row_factory=dict_row) as cur:
        # The version is written into the statement, not bound, so the planner
        # can see it matches the partial index (takes_rescore_idx) — the
        # backlog is found by an index scan, not by reading every take.
        cur.execute(
            f"""
            select id, scores, analysis from takes
            where status = 'scored' and scoring_version < {int(SCORING_VERSION)}
            order by recorded_at
            for update skip locked
            limit %s
            """,
            (limit,),
        )
        rows = cur.fetchall()
        for row in rows:
            measured = _measured(row)
            if measured is None:
                # Nothing to mark — a take of a clip that never had sound — so
                # only note that it has been looked at, and never look again.
                cur.execute(
                    "update takes set scoring_version = %s where id = %s",
                    (SCORING_VERSION, row["id"]),
                )
                continue
            analysis = dict(row["analysis"]) if isinstance(row["analysis"], dict) else {}
            words = analysis.get("words")
            matched = recheck(words) if isinstance(words, dict) else None
            if matched is not None:
                analysis["words"] = matched.as_json()
            score, scores, analysis["raw"] = mark(measured, matched)
            cur.execute(
                """
                update takes set score = %s, scores = %s, analysis = %s, scoring_version = %s
                where id = %s
                """,
                (score, json.dumps(scores), json.dumps(analysis), SCORING_VERSION, row["id"]),
            )
    if rows:
        log.info("marked %d older takes again", len(rows))
    return len(rows)
