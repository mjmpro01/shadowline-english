"""The worker against a real database and a real object store.

Postgres because the claim depends on `for update skip locked`, and files on
disk because the worker's job is to read a recording someone else wrote.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from shadowline.queue import MAX_ATTEMPTS, Job, Queue
from shadowline.transcribe import TranscribeFailed, Transcription, Word
from shadowline.words import FLOOR
from shadowline.worker import WordCheck, run_once

# db and blobs come from conftest, so the cutter tests build their schema the
# same way rather than keeping a second copy of it.
FIXTURES = Path(__file__).parent / "fixtures"


class FakeTranscriber:
    """Whisper, stood in for. The worker's job is to act on a transcript, and
    running a real model in a test would measure the model instead."""

    def __init__(self, heard: str | None = "", fails: bool = False):
        self.heard = heard
        self.fails = fails

    def transcribe(self, path: Path) -> Transcription:
        if self.fails:
            raise TranscribeFailed("no speech found")
        words = [Word(start=0.0, end=0.1, text=text) for text in (self.heard or "").split()]
        return Transcription(language="en", words=words)


def seed(conn, root: Path, *, clip_audio="identical.reference.wav", take_audio="identical.take.wav",
         line: str | None = None):
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

    captions = json.dumps([{"text": line, "ipa": ""}] if line else [])
    clip_id = conn.execute(
        """insert into clips (title, duration_seconds, audio_key, captions)
           values ('Line one', 2.4, %s, %s) returning id""",
        (clip_key, captions),
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


# --- the word check ---------------------------------------------------------
#
# Prosody says how well the line was delivered. It cannot say whether the line
# was delivered at all, and until the check below existed a hummed take scored
# like a spoken one.


def test_saying_the_whole_line_leaves_the_prosody_score_alone(db, blobs, tmp_path):
    store, root = blobs
    take_id = seed(db, root, line="We were on a break")

    assert run_once(Queue(db), store, WordCheck(FakeTranscriber("we were on a break"), tmp_path)) is True

    _, score, _, analysis, _ = take_row(db, take_id)
    assert score == 100
    assert analysis["words"]["accuracy"] == 1.0
    assert all(word["heard"] for word in analysis["words"]["line"])


def test_a_take_with_none_of_the_words_keeps_only_the_floor(db, blobs, tmp_path):
    store, root = blobs
    take_id = seed(db, root, line="We were on a break")

    assert run_once(Queue(db), store, WordCheck(FakeTranscriber("la la la la"), tmp_path)) is True

    _, score, scores, analysis, _ = take_row(db, take_id)
    assert score == round(100 * FLOOR)
    # The prosody is still reported as measured — it was measured. What changed
    # is the headline number, which is the one a learner reads.
    assert scores["Intonation"] == 100
    assert analysis["words"]["accuracy"] == 0.0


def test_the_missing_word_is_named(db, blobs, tmp_path):
    store, root = blobs
    take_id = seed(db, root, line="We were on a break")

    run_once(Queue(db), store, WordCheck(FakeTranscriber("we were on break"), tmp_path))

    _, _, _, analysis, _ = take_row(db, take_id)
    dropped = [word["text"] for word in analysis["words"]["line"] if not word["heard"]]
    assert dropped == ["a"]


def test_a_transcriber_that_hears_nothing_costs_the_learner_nothing(db, blobs, tmp_path):
    # An empty transcript is a quiet room at least as often as it is silence.
    store, root = blobs
    take_id = seed(db, root, line="We were on a break")

    run_once(Queue(db), store, WordCheck(FakeTranscriber(""), tmp_path))

    _, score, _, analysis, _ = take_row(db, take_id)
    assert score == 100
    assert "words" not in analysis


def test_a_transcriber_that_fails_costs_the_learner_nothing(db, blobs, tmp_path):
    # The word check is the half of the score nobody is waiting for. It must
    # never be the reason a take has none.
    store, root = blobs
    take_id = seed(db, root, line="We were on a break")

    run_once(Queue(db), store, WordCheck(FakeTranscriber(fails=True), tmp_path))

    status, score, _, analysis, error = take_row(db, take_id)
    assert status == "scored", error
    assert score == 100
    assert "words" not in analysis


def test_a_clip_with_no_line_is_not_checked(db, blobs, tmp_path):
    # Every clip published before transcription existed, and every one an admin
    # never typed a line for.
    store, root = blobs
    take_id = seed(db, root, line=None)

    run_once(Queue(db), store, WordCheck(FakeTranscriber("anything at all"), tmp_path))

    _, score, _, analysis, _ = take_row(db, take_id)
    assert score == 100
    assert "words" not in analysis


def test_no_transcriber_at_all_still_scores(db, blobs):
    # How every take was scored before this existed, and how a deployment that
    # has not installed a model still works.
    store, root = blobs
    take_id = seed(db, root, line="We were on a break")

    assert run_once(Queue(db), store) is True

    _, score, _, analysis, _ = take_row(db, take_id)
    assert score == 100
    assert "words" not in analysis


def a_job() -> Job:
    return Job(
        id=1,
        take_id="take",
        attempts=1,
        clip_id="clip",
        take_audio_key="k",
        clip_audio_key="k",
        line="We were on a break",
    )


def test_a_worker_with_no_model_stops_paying_for_it(tmp_path):
    # Loading a model that is not on disk takes about ten seconds and then
    # fails. A worker without one must not spend that on every take for as long
    # as it runs.
    class NeverLoads:
        calls = 0

        def transcribe(self, path):
            type(self).calls += 1
            raise TranscribeFailed("no such model")

    never = NeverLoads()
    checker = WordCheck(never, tmp_path)

    for _ in range(4):
        assert checker.heard(a_job(), b"pretend audio") is None

    assert NeverLoads.calls == WordCheck.GIVE_UP_AFTER
    assert checker.available is False


def test_a_model_that_has_worked_once_is_never_given_up_on(tmp_path):
    # After a success, a failure is about the recording rather than the model.
    class FailsAfterFirst:
        calls = 0

        def transcribe(self, path):
            type(self).calls += 1
            if type(self).calls == 1:
                return Transcription(language="en", words=[Word(0.0, 0.1, "we")])
            raise TranscribeFailed("could not read that one")

    checker = WordCheck(FailsAfterFirst(), tmp_path)
    for _ in range(4):
        checker.heard(a_job(), b"pretend audio")

    assert FailsAfterFirst.calls == 4
    assert checker.available is True


def test_the_word_check_leaves_nothing_behind(tmp_path):
    # The take is written to disk so the model can read it, and a worker that
    # kept every take it had ever scored would fill its own disk.
    checker = WordCheck(FakeTranscriber("we were on a break"), tmp_path)
    checker.heard(a_job(), b"pretend audio")
    assert list(tmp_path.iterdir()) == []


def clip_of(conn, take_id):
    return conn.execute("select clip_id from takes where id = %s", (take_id,)).fetchone()[0]


def test_a_take_waits_for_its_clips_sound_to_be_cut(db, blobs):
    """A clip's sound is cut on the server moments after it is published. A
    take recorded in those moments is scored once the sound is there — not
    passed over, and not given up on."""
    store, root = blobs
    take_id = seed(db, root)
    clip_id = clip_of(db, take_id)
    db.execute("update clips set audio_key = null where id = %s", (clip_id,))
    db.execute("insert into cut_jobs (clip_id) values (%s)", (clip_id,))

    queue = Queue(db)
    assert queue.claim() is None, "a take was claimed before its clip had a sound"
    assert take_row(db, take_id)[0] == "pending"

    # The cutter finishes: the sound is there and the job is gone.
    db.execute("update clips set audio_key = 'clip/one/audio.wav' where id = %s", (clip_id,))
    db.execute("delete from cut_jobs where clip_id = %s", (clip_id,))
    assert run_once(queue, store) is True
    status, score, *_ = take_row(db, take_id)
    assert status == "scored" and score is not None


def test_a_take_whose_clip_never_got_a_sound_is_final_unscored(db, blobs):
    """The cut gave up: nothing to score against, which is what a take of a
    clip with no sound has always been — kept, measured, never scored."""
    store, root = blobs
    take_id = seed(db, root, clip_audio=None)

    assert Queue(db).claim() is None
    status, score, *_ = take_row(db, take_id)
    assert status == "scored" and score is None
    assert db.execute("select count(*) from scoring_jobs").fetchone()[0] == 0
