"""The dubbing worker against a real database, real files and real ffmpeg.

What matters here is that the output really does carry the clip's picture and
the learner's voice — a mux that silently drops one of them still exits zero and
still produces a file.
"""

import shutil
import subprocess
from pathlib import Path

import pytest

from shadowline.dubqueue import MAX_ATTEMPTS, DubQueue
from shadowline.dubber import run_once

pytestmark = pytest.mark.skipif(
    shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
    reason="dubbing is ffmpeg; without it there is nothing to test",
)


def make_clip(path: Path, seconds: float = 4) -> None:
    """A cut clip: picture and its original sound."""
    subprocess.run(
        [
            "ffmpeg", "-nostdin", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", f"testsrc=size=160x90:rate=10:duration={seconds}",
            "-f", "lavfi", "-i", f"sine=frequency=200:duration={seconds}",
            "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-shortest", str(path),
        ],
        check=True, capture_output=True,
    )


def make_voice(path: Path, seconds: float = 3) -> None:
    """A learner's take, in the webm/opus MediaRecorder produces."""
    subprocess.run(
        [
            "ffmpeg", "-nostdin", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
            "-c:a", "libopus", str(path),
        ],
        check=True, capture_output=True,
    )


def streams(path: Path) -> list[str]:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    return [line.strip() for line in out.splitlines() if line.strip()]


def duration(path: Path) -> float:
    return float(
        subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    )


def seed(conn, root: Path, *, clip=True, voice=True, clip_seconds=4.0, voice_seconds=3.0):
    """A user, a cut clip, a take against it, and a dub job."""
    user_id = conn.execute(
        "insert into users (email, name) values ('learner@example.com', 'Learner') returning id"
    ).fetchone()[0]

    video_key = None
    if clip:
        video_key = "clip/one/cut.mp4"
        (root / "clips" / "clip" / "one").mkdir(parents=True, exist_ok=True)
        make_clip(root / "clips" / video_key, clip_seconds)

    voice_key = None
    if voice:
        voice_key = "take/one/voice.webm"
        (root / "takes" / "take" / "one").mkdir(parents=True, exist_ok=True)
        make_voice(root / "takes" / voice_key, voice_seconds)

    clip_id = conn.execute(
        "insert into clips (title, duration_seconds, video_key) values ('Line one', %s, %s) returning id",
        (clip_seconds, video_key),
    ).fetchone()[0]
    take_id = conn.execute(
        "insert into takes (user_id, clip_id, audio_key) values (%s, %s, %s) returning id",
        (user_id, clip_id, voice_key),
    ).fetchone()[0]
    conn.execute("insert into dub_jobs (take_id) values (%s)", (take_id,))
    return take_id


def dub_key(conn, take_id):
    return conn.execute("select dub_key from takes where id = %s", (take_id,)).fetchone()[0]


def test_a_queued_take_is_dubbed_and_written_back(db, blobs, tmp_path):
    store, root = blobs
    take_id = seed(db, root)

    assert run_once(DubQueue(db), store, tmp_path) is True

    key = dub_key(db, take_id)
    assert key and key.endswith(".mp4"), f"dub key is {key!r}"

    file = root / "takes" / key
    assert file.exists(), "the dub key points at nothing"
    # Both halves of the job: the clip's picture and the learner's voice.
    assert streams(file) == ["video", "audio"]

    assert db.execute("select count(*) from dub_jobs").fetchone()[0] == 0


def test_the_dub_ends_when_the_shorter_side_does(db, blobs, tmp_path):
    """A learner runs long or stops early. Ending with whichever runs out beats
    a frozen frame or a tail of silence."""
    store, root = blobs
    seed(db, root, clip_seconds=4.0, voice_seconds=2.0)

    run_once(DubQueue(db), store, tmp_path)

    file = root / "takes" / dub_key(db, db.execute("select id from takes").fetchone()[0])
    assert 1.7 < duration(file) < 2.4, f"dub is {duration(file)}s, wanted about 2"


def test_an_empty_queue_is_not_an_error(db, blobs, tmp_path):
    store, _ = blobs
    assert run_once(DubQueue(db), store, tmp_path) is False


def test_a_take_whose_recording_is_missing_stops_being_retried(db, blobs, tmp_path):
    store, root = blobs
    take_id = seed(db, root)
    (root / "takes" / "take" / "one" / "voice.webm").unlink()
    queue = DubQueue(db)

    for _ in range(MAX_ATTEMPTS):
        assert run_once(queue, store, tmp_path) is True

    assert dub_key(db, take_id) is None
    # No job left, so the screen stops waiting and offers the button again.
    assert db.execute("select count(*) from dub_jobs").fetchone()[0] == 0


def test_a_take_against_a_clip_with_no_video_is_dropped_rather_than_retried(db, blobs, tmp_path):
    """Its own claim refuses it: there is no picture to dub onto, and three
    attempts at that would be three attempts at nothing."""
    store, root = blobs
    take_id = seed(db, root, clip=False)

    assert run_once(DubQueue(db), store, tmp_path) is False
    assert dub_key(db, take_id) is None
    assert db.execute("select count(*) from dub_jobs").fetchone()[0] == 0


def test_the_take_keeps_its_recording_when_the_dub_fails(db, blobs, tmp_path):
    store, root = blobs
    take_id = seed(db, root)
    (root / "takes" / "take" / "one" / "voice.webm").write_bytes(b"not audio")

    run_once(DubQueue(db), store, tmp_path)

    audio = db.execute("select audio_key from takes where id = %s", (take_id,)).fetchone()[0]
    assert audio == "take/one/voice.webm"
