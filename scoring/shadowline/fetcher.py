"""Downloading a recording an admin gave a link to.

The admin pastes the address of a short video in the studio; this fetches it
with yt-dlp and stores it where an uploaded file would have gone, and from
there it is an upload like any other — transcribed next, by this same worker.

The video is stored as it was published. Who published it is written on the
row — the channel's handle, or its name — and every clip cut from it shows it
to the learner, with a link back to the original.

Two limits keep this to what it is for. Only sites yt-dlp knows by name are
fetched, never its catch-all for any page with a video on it: that one would
fetch whatever address it is given, from inside the server's network. And the
address's host must resolve to the public internet, checked here because the
API can only look at the name.
"""

from __future__ import annotations

import ipaddress
import logging
import os
import re
import socket
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol
from urllib.parse import urlsplit

from . import telemetry
from .fetchqueue import FetchJob, FetchQueue, Stored
from .storage import Storage

log = logging.getLogger("shadowline.fetcher")

# The same ceiling the API puts on a file an admin uploads.
MAX_BYTES = 2 << 30
# Shorts are a minute or three. Anything much longer is not what this is for,
# and would tie up the transcriber for a long time.
MAX_SECONDS = 20 * 60

CONTENT_TYPES = {".mp4": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska", ".mov": "video/quicktime"}


class FetchFailed(Exception):
    """The download did not happen. ``permanent`` when asking again will not help."""

    def __init__(self, reason: str, *, permanent: bool = False) -> None:
        super().__init__(reason)
        self.permanent = permanent


@dataclass
class Fetched:
    path: Path
    title: str
    credit: str
    seconds: float


class Downloader(Protocol):
    def download(self, url: str, workdir: Path) -> Fetched: ...


Resolver = Callable[[str], list[str]]


def resolve(host: str) -> list[str]:
    return [info[4][0] for info in socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)]


def check_public(url: str, resolver: Resolver = resolve) -> None:
    """Refuses an address whose host is not on the public internet.

    The API has already turned away numeric hosts and names like localhost;
    this is the half it cannot do, because a public-looking name can resolve
    to a private address.
    """
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname:
        raise FetchFailed("only https addresses are fetched", permanent=True)
    try:
        addresses = resolver(parts.hostname)
    except OSError as err:
        raise FetchFailed(f"could not find {parts.hostname}: {err}") from err
    if not addresses:
        raise FetchFailed(f"could not find {parts.hostname}")
    for address in addresses:
        if not ipaddress.ip_address(address.split("%", 1)[0]).is_global:
            raise FetchFailed(f"{parts.hostname} is not a public website", permanent=True)


def credit_of(info: dict) -> str:
    """Whose video it is, as the learner should read it: the channel's @handle
    when the site has one, else the name it publishes under."""
    handle = str(info.get("uploader_id") or "")
    if handle.startswith("@"):
        return handle
    for key in ("channel", "uploader", "creator", "uploader_id"):
        value = str(info.get(key) or "").strip()
        if value:
            return value
    return ""


# What yt-dlp says about a video that will never download, whatever is tried.
PERMANENT = re.compile(
    r"private|unavailable|not available|not found|http error 404|http error 410|"
    r"removed|deleted|does not exist|unsupported url|"
    r"members[- ]only|sign in to confirm your age|age[- ]restricted|copyright|"
    r"terminated|live event|is live|playlist|larger than|longer than",
    re.IGNORECASE,
)
ANSI = re.compile(r"\x1b\[[0-9;]*m")


def reason_of(message: str) -> str:
    """yt-dlp's error, without its colour codes and its 'ERROR: [site] id:'."""
    message = ANSI.sub("", message).strip()
    message = re.sub(r"^ERROR:\s*", "", message)
    message = re.sub(r"^\[[^\]]+\]\s*[^:\s]*:\s*", "", message)
    return message[:300] or "the download failed"


class _Quiet:
    """yt-dlp's logger: its chatter to debug, its errors raised, not printed."""

    def debug(self, msg: str) -> None:
        log.debug("%s", msg)

    def info(self, msg: str) -> None:
        log.debug("%s", msg)

    def warning(self, msg: str) -> None:
        log.debug("yt-dlp: %s", msg)

    def error(self, msg: str) -> None:
        log.debug("yt-dlp: %s", msg)


class YtDlpDownloader:
    def __init__(self, resolver: Resolver = resolve, cookies: str | None = None) -> None:
        self.resolver = resolver
        # A cookies file, for sites that ask a server's address to sign in
        # before they will hand over a video. Optional.
        self.cookies = cookies if cookies is not None else os.environ.get("FETCH_COOKIES_FILE")

    def options(self, workdir: Path) -> dict:
        options = {
            # An mp4 the browser can decode, no taller than 1080: the studio
            # draws it, and the cutter cuts it down further anyway.
            "format": (
                "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/"
                "bv*[height<=1080]+ba/b[height<=1080]/b"
            ),
            "merge_output_format": "mp4",
            "outtmpl": str(workdir / "fetched.%(ext)s"),
            "noplaylist": True,
            "max_filesize": MAX_BYTES,
            "allowed_extractors": ["default", "-generic"],
            "socket_timeout": 30,
            "retries": 2,
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
            "logger": _Quiet(),
        }
        if self.cookies:
            options["cookiefile"] = self.cookies
        return options

    def download(self, url: str, workdir: Path) -> Fetched:
        check_public(url, self.resolver)

        import yt_dlp
        from yt_dlp.utils import DownloadError

        try:
            with yt_dlp.YoutubeDL(self.options(workdir)) as ydl:
                info = ydl.extract_info(url, download=False)
                if info is None:
                    raise FetchFailed("found no video at that address", permanent=True)
                if info.get("_type") in ("playlist", "multi_video"):
                    raise FetchFailed("that address is a playlist, not one video", permanent=True)
                if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming"):
                    raise FetchFailed("a live stream cannot be fetched", permanent=True)
                seconds = float(info.get("duration") or 0)
                if seconds > MAX_SECONDS:
                    raise FetchFailed(
                        f"the video is {seconds / 60:.0f} minutes long; links are for videos "
                        f"up to {MAX_SECONDS // 60}",
                        permanent=True,
                    )
                info = ydl.process_ie_result(info, download=True)
        except DownloadError as err:
            reason = reason_of(str(err))
            if "no suitable extractor" in reason.lower() or "unsupported url" in reason.lower():
                raise FetchFailed(
                    "unsupported url: the downloader does not know that site", permanent=True
                ) from err
            raise FetchFailed(reason, permanent=bool(PERMANENT.search(reason))) from err

        downloads = info.get("requested_downloads") or []
        path = Path(downloads[0]["filepath"]) if downloads else None
        if path is None or not path.exists():
            # yt-dlp skips a file over max_filesize with a message, not an error.
            raise FetchFailed("the video is larger than a recording can be", permanent=True)
        return Fetched(
            path=path,
            title=str(info.get("title") or "").strip(),
            credit=credit_of(info),
            seconds=float(info.get("duration") or 0),
        )


def fetch_job(job: FetchJob, blobs: Storage, downloader: Downloader, workdir: Path) -> Stored:
    """Downloads one link and stores the file. Returns what to write on the row."""
    fetched = downloader.download(job.url, workdir)
    try:
        size = fetched.path.stat().st_size
        if size > MAX_BYTES:
            raise FetchFailed("the video is larger than a recording can be", permanent=True)
        suffix = fetched.path.suffix.lower()
        content_type = CONTENT_TYPES.get(suffix, "video/mp4")
        key = f"source/{uuid.uuid4()}{suffix or '.mp4'}"
        blobs.put("clips", key, fetched.path, content_type)
    finally:
        fetched.path.unlink(missing_ok=True)
    return Stored(
        key=key,
        content_type=content_type,
        bytes=size,
        seconds=fetched.seconds,
        title=fetched.title,
        credit=fetched.credit,
    )


def fetch_once(queue: FetchQueue, blobs: Storage, downloader: Downloader, workdir: Path) -> bool:
    """Downloads one link. Returns False when the queue was empty."""
    job = queue.claim()
    if job is None:
        return False

    started = time.monotonic()
    with telemetry.track_job("transcribing", {"job.type": "fetch", "source_id": job.source_id}) as traced:
        try:
            stored = fetch_job(job, blobs, downloader, workdir)
        except FetchFailed as err:
            traced["status"] = "rejected"
            log.warning("could not fetch %s for source %s: %s", job.url, job.source_id, err)
            queue.fail(job, str(err), permanent=err.permanent)
            return True
        except Exception:
            traced["status"] = "error"
            log.exception("fetching source %s failed unexpectedly", job.source_id)
            queue.fail(job, "the download failed")
            return True
        finally:
            for leftover in workdir.glob("fetched.*"):
                leftover.unlink(missing_ok=True)

        if not queue.complete(job, stored):
            # Deleted while it downloaded: nothing will ever read the file.
            log.info("source %s went away while it downloaded", job.source_id)
            try:
                blobs.delete("clips", stored.key)
            except Exception:
                log.warning("orphaned source object %s", stored.key, exc_info=True)
            return True

        log.info(
            "fetched source %s: %s, %d bytes (%.0fs)",
            job.source_id,
            stored.credit or "no credit",
            stored.bytes,
            time.monotonic() - started,
        )
        return True
