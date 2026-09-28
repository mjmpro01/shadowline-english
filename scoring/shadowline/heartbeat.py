"""A worker saying it is alive.

One row per service in ``worker_heartbeats``, rewritten every few seconds from a
thread of its own, idle or busy. The console reads it to tell "queued for ten
minutes" apart from "queued for ten minutes because nothing is running to take
it" — the second is a service to start, not a recording to wait for.

A thread and a connection of its own, because a worker spends minutes inside
one job, and a heartbeat that only beat between jobs would go quiet exactly
while the worker is busiest.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone

import psycopg

from . import version

log = logging.getLogger("shadowline.heartbeat")

# The console treats a service as gone after 45 seconds without a beat, so this
# leaves room for a slow database or a missed beat or two.
EVERY = 10.0


def beat(
    conn: psycopg.Connection,
    service: str,
    busy: bool,
    version: str = "",
    started_at: datetime | None = None,
) -> None:
    """Writes one heartbeat: alive, busy or not, which code, and since when.
    Separate from the thread so a test can call it."""
    conn.execute(
        """
        insert into worker_heartbeats (service, seen_at, busy, version, started_at)
        values (%s, now(), %s, %s, %s)
        on conflict (service) do update
        set seen_at = now(), busy = excluded.busy,
            version = excluded.version, started_at = excluded.started_at
        """,
        (service, busy, version, started_at),
    )


class Heartbeat:
    """Beats for ``service`` until stopped. Set ``busy`` around each job."""

    def __init__(self, dsn: str, service: str) -> None:
        self.dsn = dsn
        self.service = service
        self.busy = False
        self.version = version.current()
        self.started_at = datetime.now(timezone.utc)
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name=f"{service}-heartbeat", daemon=True)

    def start(self) -> "Heartbeat":
        self._thread.start()
        return self

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=EVERY)

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                with psycopg.connect(self.dsn, autocommit=True) as conn:
                    while not self._stop.is_set():
                        beat(conn, self.service, self.busy, self.version, self.started_at)
                        self._stop.wait(EVERY)
            # Never fatal: a worker that cannot report itself can still work.
            # The table may not exist yet beside a server still migrating.
            except psycopg.Error as err:
                log.debug("heartbeat skipped (%s)", err)
                self._stop.wait(EVERY)
