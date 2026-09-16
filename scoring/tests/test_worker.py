"""The worker against a real database and a real object store.

Postgres because the claim depends on `for update skip locked`, and files on
disk because the worker's job is to read a recording someone else wrote.
"""

import os
import shutil
import subprocess
import uuid
from pathlib import Path

import psycopg
import pytest

from shadowline.queue import MAX_ATTEMPTS, Queue
from shadowline.storage import DiskStorage
from shadowline.worker import run_once

FIXTURES = Path(__file__).parent / "fixtures"
MIGRATION = Path(__file__).resolve().parents[2] / "server/internal/db/migrations/00001_init.sql"


def admin_dsn() -> str:
    dsn = os.environ.get("TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("set TEST_DATABASE_URL to run worker tests against Postgres")
    return dsn


@pytest.fixture
def db():
    """A database of this test's own, with the server's real schema applied.

    The schema comes from the Go server's migration file rather than a copy
    kept here: a copy would drift, and the first thing to break would be the
    queue semantics these tests exist to check.
    """
    admin = admin_dsn()
    name = f"shadowline_worker_{uuid.uuid4().hex[:12]}"

    with psycopg.connect(admin, autocommit=True) as conn:
        conn.execute(f"create database {name}")

    dsn = admin.rsplit("/", 1)[0] + "/" + name
    sql = MIGRATION.read_text()
    up = sql.split("-- +goose Up", 1)[1].split("-- +goose Down", 1)[0]
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute(up)
        yield conn

    with psycopg.connect(admin, autocommit=True) as conn:
        conn.execute(f"drop database {name} with (force)")


@pytest.fixture
def blobs(tmp_path):
    root = tmp_path / "blobs"
    (root / "clips").mkdir(parents=True)
    (root / "takes").mkdir(parents=True)
    return DiskStorage(root), root


def seed(conn, root: Path, *, clip_audio="identical.reference.wav", take_audio="identical.take.wav"):
    """A user, a clip, a take and its job — what the API would have written."""
    user_id = conn.execute(
        "insert into users (email, name) values ('learner@example.com', 'Learner') returning id"
    ).fetchone()[0]

    # Keys are laid out the way the API writes them: "<kind>/<id>/<uuid>.<ext>".
    clip_key = take_key = None
    if clip_audio:
        clip_key = "clip/one/audio.wav"
        (root / "clips" / "clip" / "one").mkdir(parents=True, exist_ok=True)
        shutil.copy(FIXTURES / clip_audio, root / "clips" / clip_key)
    if take_audio:
        take_key = "take/one/audio.wav"
        (root / "takes" / "take" / "one").mkdir(parents=True, exist_ok=True)
        shutil.copy(FIXTURES / take_audio, root / "takes" / take_key)

    clip_id = conn.execute(
        "insert into clips (title, duration_seconds, audio_key) values ('Line one', 2.4, %s) returning id",
        (clip_key,),
    ).fetchone()[0]
    take_id = conn.execute(
        "insert into takes (user_id, clip_id, audio_key) values (%s, %s, %s) returning id",
        (user_id, clip_id, take_key),
    ).fetchone()[0]
    conn.execute("insert into scoring_jobs (take_id) values (%s)", (take_id,))
    return take_id


def take_row(conn, take_id):
    return conn.execute(
        "select status, score, scores, analysis, error from takes where id = %s", (take_id,)
    ).fetchone()


def test_a_queued_job_is_scored_and_written_back(db, blobs):
    store, root = blobs
    take_id = seed(db, root)

    assert run_once(Queue(db), store) is True

    status, score, scores, analysis, error = take_row(db, take_id)
    assert status == "scored", error
    assert score == 100, "the same delivery against itself should be a perfect score"
    assert scores == {"Intonation": 100, "Rhythm": 100, "Stress": 100, "Variation": 100}
    assert analysis["user"] and analysis["reference"]
    assert analysis["meanDeviation"] < 0.1
    assert db.execute("select count(*) from scoring_jobs").fetchone()[0] == 0


def test_an_empty_queue_is_not_an_error(db, blobs):
    store, _ = blobs
    assert run_once(Queue(db), store) is False


def test_a_take_with_no_speech_in_it_fails_rather_than_scoring_zero(db, blobs):
    """Silence is not a bad delivery — it is nothing to measure."""
    store, root = blobs
    silent = root / "takes" / "take" / "one" / "silent.wav"
    silent.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
         "-i", "anullsrc=r=8000:cl=mono", "-t", "2", str(silent), "-y"],
        check=True,
    )
    take_id = seed(db, root, take_audio=None)
    db.execute("update takes set audio_key = 'take/one/silent.wav' where id = %s", (take_id,))

    for _ in range(MAX_ATTEMPTS):
        assert run_once(Queue(db), store) is True

    status, score, _, _, error = take_row(db, take_id)
    assert status == "failed"
    assert score is None, "a take that could not be measured must not carry a score"
    assert "no speech" in error


def test_a_missing_recording_stops_being_retried(db, blobs):
    store, root = blobs
    take_id = seed(db, root)
    (root / "takes" / "take" / "one" / "audio.wav").unlink()

    for attempt in range(MAX_ATTEMPTS):
        assert run_once(Queue(db), store) is True

    assert db.execute("select count(*) from scoring_jobs").fetchone()[0] == 0
    status, _, _, _, error = take_row(db, take_id)
    assert status == "failed"
    assert "missing" in error


def test_a_failed_job_is_retried_before_it_gives_up(db, blobs):
    store, root = blobs
    seed(db, root)
    (root / "takes" / "take" / "one" / "audio.wav").unlink()

    run_once(Queue(db), store)
    state, attempts = db.execute("select state, attempts from scoring_jobs").fetchone()
    assert state == "queued", "the job should be available again"
    assert attempts == 1


def test_a_webm_recording_scores_the_same_as_the_wav_it_came_from(db, blobs):
    """MediaRecorder sends WebM/Opus, not WAV. Lossy compression must not move
    the score, or a learner's number would depend on their browser."""
    store, root = blobs
    take_id = seed(db, root)
    webm = root / "takes" / "take" / "one" / "audio.webm"
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(FIXTURES / "identical.take.wav"),
         "-c:a", "libopus", "-b:a", "64k", "-f", "webm", str(webm), "-y"],
        check=True,
    )
    db.execute("update takes set audio_key = 'take/one/audio.webm' where id = %s", (take_id,))

    assert run_once(Queue(db), store) is True
    status, score, _, _, error = take_row(db, take_id)
    assert status == "scored", error
    assert score == 100
