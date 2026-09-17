"""Cutting one clip out of a source recording, with ffmpeg.

Re-encoded rather than stream-copied. A copy can only cut on a keyframe, and a
keyframe is typically seconds away from where a line actually starts — which for
a clip that is itself a few seconds long means cutting the wrong thing. Clips
are short, so re-encoding one is cheap.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path

log = logging.getLogger("shadowline.video")


class CutFailed(RuntimeError):
    """The source could not be cut, and retrying will not change that."""


# Generous, because it is bounded by the source's size rather than the clip's:
# ffmpeg has to reach the start position before it encodes anything.
CUT_TIMEOUT_SECONDS = 600


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def cut(source: Path, start: float, end: float, dest: Path) -> None:
    """Writes seconds [start, end) of source to dest as mp4."""
    duration = end - start
    if duration <= 0:
        raise CutFailed(f"clip has no length: {start} to {end}")

    command = [
        "ffmpeg",
        "-nostdin",
        "-loglevel", "error",
        # -ss before -i seeks by index instead of decoding up to the start,
        # which is the difference between a cut of a long file taking a moment
        # and taking minutes. -accurate_seek keeps it frame-accurate anyway.
        "-accurate_seek",
        "-ss", f"{start:.3f}",
        "-i", str(source),
        "-t", f"{duration:.3f}",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "26",
        # Browsers refuse h264 in anything but 4:2:0, and some sources are not.
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        # Puts the index at the front, so the clip starts playing before it has
        # finished downloading.
        "-movflags", "+faststart",
        "-y",
        str(dest),
    ]

    try:
        done = subprocess.run(
            command, capture_output=True, timeout=CUT_TIMEOUT_SECONDS, check=False
        )
    except subprocess.TimeoutExpired as err:
        raise CutFailed(f"ffmpeg timed out after {CUT_TIMEOUT_SECONDS}s") from err
    except FileNotFoundError as err:
        raise CutFailed("ffmpeg is not installed") from err

    if done.returncode != 0:
        # ffmpeg's last line is the one that says what was wrong; the rest is
        # the banner, and putting all of it in the job's error column helps
        # nobody read it.
        detail = done.stderr.decode("utf-8", "replace").strip().splitlines()
        raise CutFailed(detail[-1] if detail else f"ffmpeg exited {done.returncode}")

    if not dest.exists() or dest.stat().st_size == 0:
        raise CutFailed("ffmpeg produced nothing")


def has_video_stream(path: Path) -> bool:
    """Whether the file has a picture at all.

    An audio file in a video container reaches the cutter looking like a video
    and produces an mp4 with no picture in it, which is worse than no video: the
    app would offer a player showing black.
    """
    try:
        done = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=codec_type",
                "-of", "csv=p=0",
                str(path),
            ],
            capture_output=True,
            timeout=60,
            check=False,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False
    return done.returncode == 0 and b"video" in done.stdout


def poster(source: Path, at: float, dest: Path, height: int = 360) -> None:
    """Writes a single frame as a jpg, for the library card.

    Taken from the source rather than from the cut, so it costs one more seek
    rather than a second decode of a file that is already on disk either way.
    A few kilobytes: the grid shows twenty of these, and downloading twenty
    videos to show twenty thumbnails would be the alternative.
    """
    command = [
        "ffmpeg",
        "-nostdin",
        "-loglevel", "error",
        "-accurate_seek",
        "-ss", f"{max(0.0, at):.3f}",
        "-i", str(source),
        "-frames:v", "1",
        "-vf", f"scale=-2:{height}",
        "-q:v", "4",
        "-y",
        str(dest),
    ]
    try:
        done = subprocess.run(command, capture_output=True, timeout=120, check=False)
    except subprocess.TimeoutExpired as err:
        raise CutFailed("ffmpeg timed out taking a poster frame") from err
    except FileNotFoundError as err:
        raise CutFailed("ffmpeg is not installed") from err

    if done.returncode != 0 or not dest.exists() or dest.stat().st_size == 0:
        detail = done.stderr.decode("utf-8", "replace").strip().splitlines()
        raise CutFailed(detail[-1] if detail else "ffmpeg produced no poster frame")
