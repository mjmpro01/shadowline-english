"""The cutter against a real database, a real object store and real ffmpeg.

Nothing here is mocked: the whole point of the cutter is that ffmpeg produces a
playable file at the right offset, and a stub proves only that the stub was
called.
"""

import shutil
import subprocess
from pathlib import Path

import pytest

from shadowline.cutqueue import MAX_ATTEMPTS, CutQueue
from shadowline.cutter import SourceCache, run_once
from shadowline.video import has_video_stream

pytestmark = pytest.mark.skipif(
    shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
    reason="the cutter is ffmpeg; without it there is nothing to test",
)


def make_source(path: Path, seconds: int = 9) -> None:
    """A recording with a picture and a sound, generated rather than committed."""
    subprocess.run(
        [
            "ffmpeg", "-nostdin", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", f"testsrc=size=160x90:rate=10:duration={seconds}",
            "-f", "lavfi", "-i", f"sine=frequency=330:duration={seconds}",
            "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-shortest", str(path),
        ],
        check=True,
        capture_output=True,
    )


def make_audio_only(path: Path, seconds: int = 4) -> None:
    subprocess.run(
        [
            "ffmpeg", "-nostdin", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", f"sine=frequency=330:duration={seconds}",
            "-c:a", "aac", str(path),
        ],
        check=True,
        capture_output=True,
    )


def seed(conn, root: Path, *, start=2.0, end=5.0, source="video", clips=1):
    """A source and its clips, as the API would have written them."""
    source_key = "source/one.mp4" if source else None
    if source:
        (root / "clips" / "source").mkdir(parents=True, exist_ok=True)
        target = root / "clips" / source_key
        if source == "video":
            make_source(target)
        elif source == "audio":
            make_audio_only(target)
        elif source == "missing":
            target.unlink(missing_ok=True)

    source_id = conn.execute(
        "insert into clip_sources (name, key, content_type) values ('lecture', %s, 'video/mp4') returning id",
        (source_key or "source/gone.mp4",),
    ).fetchone()[0]

    ids = []
    for i in range(clips):
        clip_id = conn.execute(
            """
            insert into clips (title, duration_seconds, source_id, start_seconds, end_seconds)
            values (%s, %s, %s, %s, %s) returning id
            """,
            (f"Line {i + 1}", end - start, source_id, start + i, end + i),
        ).fetchone()[0]
        conn.execute("insert into cut_jobs (clip_id) values (%s)", (clip_id,))
        ids.append(clip_id)
    return ids


def video_key(conn, clip_id):
    return conn.execute("select video_key from clips where id = %s", (clip_id,)).fetchone()[0]


def test_a_queued_clip_is_cut_and_written_back(db, blobs, tmp_path):
    store, root = blobs
    [clip_id] = seed(db, root, start=2.0, end=5.0)

    assert run_once(CutQueue(db), store, SourceCache(tmp_path), tmp_path) is True

    key = video_key(db, clip_id)
    assert key, "the clip was cut but no video key was recorded"

    cut = root / "clips" / key
    assert cut.exists(), "the key points at nothing"
    assert has_video_stream(cut), "the cut has no picture in it"

    # Three seconds were asked for, and ffmpeg should not have improvised.
    duration = float(
        subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(cut)],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    )
    assert 2.7 < duration < 3.3, f"cut is {duration}s, wanted 3s"

    # The job is gone, so no second worker picks the same clip up again.
    assert db.execute("select count(*) from cut_jobs").fetchone()[0] == 0


def test_an_empty_queue_is_not_an_error(db, blobs, tmp_path):
    store, _ = blobs
    assert run_once(CutQueue(db), store, SourceCache(tmp_path), tmp_path) is False


def test_a_source_with_no_picture_is_given_up_on(db, blobs, tmp_path):
    store, root = blobs
    [clip_id] = seed(db, root, source="audio", start=0.5, end=2.0)
    queue, cache = CutQueue(db), SourceCache(tmp_path)

    # Audio in a video container cannot produce a picture, and retrying will
    # never change that — but the queue still walks its attempts before it stops.
    for _ in range(MAX_ATTEMPTS):
        assert run_once(queue, store, cache, tmp_path) is True

    assert video_key(db, clip_id) is None
    assert db.execute("select count(*) from cut_jobs").fetchone()[0] == 0


def test_a_missing_source_stops_being_retried(db, blobs, tmp_path):
    store, root = blobs
    [clip_id] = seed(db, root, source="missing")
    queue, cache = CutQueue(db), SourceCache(tmp_path)

    for _ in range(MAX_ATTEMPTS):
        assert run_once(queue, store, cache, tmp_path) is True

    assert video_key(db, clip_id) is None
    assert db.execute("select count(*) from cut_jobs").fetchone()[0] == 0


def test_a_clip_that_cannot_be_cut_keeps_its_audio(db, blobs, tmp_path):
    """The clip is still usable, which is the whole reason cutting is a queue
    and not a step of publishing."""
    store, root = blobs
    [clip_id] = seed(db, root, source="audio")
    db.execute("update clips set audio_key = 'clip/one/audio.wav' where id = %s", (clip_id,))

    run_once(CutQueue(db), store, SourceCache(tmp_path), tmp_path)

    audio = db.execute("select audio_key from clips where id = %s", (clip_id,)).fetchone()[0]
    assert audio == "clip/one/audio.wav"


def test_one_source_is_downloaded_once_for_a_whole_batch(db, blobs, tmp_path):
    """The reason the batch finishes at all: a fifty-minute lecture fetched per
    clip is hundreds of downloads of the same file."""
    store, root = blobs
    clip_ids = seed(db, root, start=0.5, end=2.0, clips=3)

    downloads = []
    original = store.download

    def counting_download(bucket, key, dest):
        downloads.append(key)
        return original(bucket, key, dest)

    store.download = counting_download

    queue, cache = CutQueue(db), SourceCache(tmp_path)
    for _ in clip_ids:
        assert run_once(queue, store, cache, tmp_path) is True

    assert len(downloads) == 1, f"downloaded the source {len(downloads)} times for 3 clips"
    for clip_id in clip_ids:
        assert video_key(db, clip_id), "every clip in the batch should have been cut"
