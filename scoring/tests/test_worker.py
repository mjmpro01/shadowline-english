"""The worker against a real database and a real object store.

Postgres because the claim depends on `for update skip locked`, and files on
disk because the worker's job is to read a recording someone else wrote.
"""

import shutil
import subprocess
from pathlib import Path

import pytest

from shadowline.queue import MAX_ATTEMPTS, Queue
from shadowline.worker import run_once

# db and blobs come from conftest, so the cutter tests build their schema the
# same way rather than keeping a second copy of it.
FIXTURES = Path(__file__).parent / "fixtures"


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
