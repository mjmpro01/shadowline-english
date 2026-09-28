"""The heartbeat a worker writes so the console can tell it is running."""

from shadowline.heartbeat import beat


def seen(conn, service):
    return conn.execute(
        "select seen_at, busy from worker_heartbeats where service = %s", (service,)
    ).fetchone()


def test_a_beat_writes_the_service_and_whether_it_is_busy(db):
    beat(db, "transcribing", False)
    first = seen(db, "transcribing")
    assert first is not None and first[1] is False

    beat(db, "transcribing", True)
    second = seen(db, "transcribing")
    assert second[1] is True
    assert second[0] >= first[0]
    # One row per service, however often it beats.
    assert db.execute("select count(*) from worker_heartbeats").fetchone()[0] == 1


def test_services_beat_separately(db):
    beat(db, "transcribing", False)
    beat(db, "cutting", True)
    assert seen(db, "transcribing")[1] is False
    assert seen(db, "cutting")[1] is True


def test_the_thread_beats_as_soon_as_it_starts(db):
    import os
    import time

    from shadowline.heartbeat import Heartbeat

    # The fixture's connection string without its password, so rebuilt from the
    # one the tests were given, pointed at this test's own database.
    dsn = os.environ["TEST_DATABASE_URL"].rsplit("/", 1)[0] + "/" + db.info.dbname
    heartbeat = Heartbeat(dsn, "transcribing").start()
    try:
        for _ in range(50):
            if seen(db, "transcribing"):
                break
            time.sleep(0.1)
        assert seen(db, "transcribing") is not None
    finally:
        heartbeat.stop()


def test_a_beat_carries_the_version_and_when_the_worker_started(db):
    from datetime import datetime, timezone

    started = datetime(2026, 9, 28, 10, 0, tzinfo=timezone.utc)
    beat(db, "cutting", False, "abc1234", started)
    version, started_at = db.execute(
        "select version, started_at from worker_heartbeats where service = 'cutting'"
    ).fetchone()
    assert version == "abc1234"
    assert started_at == started


def test_the_version_is_the_pinned_one_when_the_deployment_sets_it(monkeypatch):
    from shadowline import version

    version.current.cache_clear()
    monkeypatch.setenv("SHADOWLINE_VERSION", "deadbee")
    try:
        assert version.current() == "deadbee"
    finally:
        version.current.cache_clear()


def test_the_version_is_the_checkouts_commit_otherwise(monkeypatch):
    import re

    from shadowline import version

    version.current.cache_clear()
    monkeypatch.delenv("SHADOWLINE_VERSION", raising=False)
    try:
        # Seven hex characters, maybe marked dirty — or unknown with no git.
        assert re.fullmatch(r"[0-9a-f]{7}(-dirty)?|unknown", version.current())
    finally:
        version.current.cache_clear()
