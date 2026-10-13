"""Downloading a recording from a link, against a real database and object store.

The site itself stands behind the Downloader protocol and is replaced here:
what these check is everything around it — storing the file, the row it
fills in, transcription queued after it, retrying and giving up — and the
checks made before anything is downloaded at all.
"""

from pathlib import Path

import pytest

from shadowline.fetcher import (
    PERMANENT,
    FetchFailed,
    Fetched,
    YtDlpDownloader,
    check_public,
    credit_of,
    fetch_once,
    reason_of,
)
from shadowline.fetchqueue import MAX_ATTEMPTS, FetchQueue

LINK = "https://www.youtube.com/shorts/abcDEF12345"


class FakeDownloader:
    def __init__(self, *, fails: FetchFailed | None = None, title="Ordering coffee", credit="@cafe_english"):
        self.fails = fails
        self.title = title
        self.credit = credit
        self.calls: list[str] = []

    def download(self, url: str, workdir: Path) -> Fetched:
        self.calls.append(url)
        if self.fails is not None:
            raise self.fails
        path = workdir / "fetched.mp4"
        path.write_bytes(b"pretend video")
        return Fetched(path=path, title=self.title, credit=self.credit, seconds=42.0)


def seed(conn, *, name=LINK):
    """A linked upload and its download, as the API writes them."""
    source_id = conn.execute(
        """
        insert into clip_sources (name, title, key, content_type, has_video, upload_state, source_url)
        values (%s, %s, '', 'video/mp4', true, 'fetching', %s) returning id
        """,
        (name, name, LINK),
    ).fetchone()[0]
    conn.execute("insert into fetch_jobs (source_id, url) values (%s, %s)", (source_id, LINK))
    return source_id


def source(conn, source_id):
    return conn.execute(
        """
        select name, title, key, upload_state, error, bytes, duration_seconds, source_credit, content_type
        from clip_sources where id = %s
        """,
        (source_id,),
    ).fetchone()


def fetch_job(conn, source_id):
    return conn.execute(
        "select state, attempts, error from fetch_jobs where source_id = %s", (source_id,)
    ).fetchone()


def test_a_linked_video_is_stored_and_queued_for_transcription(db, blobs, tmp_path):
    store, root = blobs
    source_id = seed(db)
    downloader = FakeDownloader()

    assert fetch_once(FetchQueue(db), store, downloader, tmp_path) is True
    assert downloader.calls == [LINK]

    name, title, key, state, error, size, seconds, credit, content_type = source(db, source_id)
    assert state == "stored" and error == ""
    # The link stood in for a name until the video's own title was known.
    assert name == title == "Ordering coffee"
    assert credit == "@cafe_english"
    assert key.startswith("source/") and key.endswith(".mp4")
    assert (root / "clips" / key).read_bytes() == b"pretend video"
    assert size == len(b"pretend video") and seconds == pytest.approx(42.0)
    assert content_type == "video/mp4"

    assert fetch_job(db, source_id) is None
    assert db.execute(
        "select state from transcribe_jobs where source_id = %s", (source_id,)
    ).fetchone() == ("queued",)
    # Nothing left in the working directory.
    assert list(tmp_path.glob("fetched.*")) == []


def test_a_name_the_admin_typed_is_kept(db, blobs, tmp_path):
    store, _ = blobs
    source_id = seed(db, name="Coffee shop")
    fetch_once(FetchQueue(db), store, FakeDownloader(), tmp_path)
    name, title, *_ = source(db, source_id)
    assert name == title == "Coffee shop"


def test_an_empty_queue_is_not_an_error(db, blobs, tmp_path):
    store, _ = blobs
    assert fetch_once(FetchQueue(db), store, FakeDownloader(), tmp_path) is False


def test_a_video_that_will_never_download_is_given_up_on_at_once(db, blobs, tmp_path):
    store, _ = blobs
    source_id = seed(db)
    downloader = FakeDownloader(fails=FetchFailed("Private video", permanent=True))

    fetch_once(FetchQueue(db), store, downloader, tmp_path)
    assert fetch_job(db, source_id) == ("failed", 1, "Private video")
    _, _, key, state, error, *_ = source(db, source_id)
    assert (key, state, error) == ("", "failed", "Private video")

    # Never claimed again.
    assert fetch_once(FetchQueue(db), store, downloader, tmp_path) is False
    assert len(downloader.calls) == 1


def test_a_download_that_might_work_next_time_is_retried_then_given_up_on(db, blobs, tmp_path):
    store, _ = blobs
    source_id = seed(db)
    downloader = FakeDownloader(fails=FetchFailed("connection reset"))

    fetch_once(FetchQueue(db), store, downloader, tmp_path)
    assert fetch_job(db, source_id) == ("queued", 1, "connection reset")
    assert source(db, source_id)[3] == "fetching"

    for _ in range(MAX_ATTEMPTS - 1):
        fetch_once(FetchQueue(db), store, downloader, tmp_path)
    assert fetch_job(db, source_id) == ("failed", MAX_ATTEMPTS, "connection reset")
    assert source(db, source_id)[3] == "failed"
    assert len(downloader.calls) == MAX_ATTEMPTS


def test_an_upload_deleted_while_it_downloaded_leaves_no_file(db, blobs, tmp_path):
    store, root = blobs
    source_id = seed(db)

    class DeletingDownloader(FakeDownloader):
        def download(self, url, workdir):
            db.execute("delete from clip_sources where id = %s", (source_id,))
            return super().download(url, workdir)

    # The job goes with the row (on delete cascade), so the claim already
    # holds the only reference to it.
    assert fetch_once(FetchQueue(db), store, DeletingDownloader(), tmp_path) is True
    assert [p for p in (root / "clips").rglob("*") if p.is_file()] == []


class TestBeforeDownloading:
    def public(self, host):
        return ["142.250.74.46"]

    @pytest.mark.parametrize(
        "address",
        ["127.0.0.1", "10.0.0.5", "172.17.0.1", "192.168.1.10", "169.254.169.254", "::1", "fd00::1", "0.0.0.0"],
    )
    def test_a_host_that_resolves_inside_the_network_is_refused(self, address):
        with pytest.raises(FetchFailed) as refused:
            check_public("https://videos.example.com/v/1", lambda host: ["142.250.74.46", address])
        assert refused.value.permanent

    def test_a_public_host_passes(self):
        check_public(LINK, self.public)

    def test_a_name_that_does_not_resolve_is_worth_another_try(self):
        def broken(host):
            raise OSError("temporary failure in name resolution")

        with pytest.raises(FetchFailed) as failed:
            check_public(LINK, broken)
        assert not failed.value.permanent

    def test_a_private_host_is_refused_before_the_downloader_runs(self, tmp_path):
        with pytest.raises(FetchFailed, match="not a public website"):
            YtDlpDownloader(resolver=lambda host: ["10.1.2.3"]).download(LINK, tmp_path)

    def test_a_page_on_a_site_the_downloader_does_not_know_is_not_fetched(self, tmp_path):
        """The catch-all extractor is off: it would fetch any address at all."""
        with pytest.raises(FetchFailed) as refused:
            YtDlpDownloader(resolver=self.public).download("https://example.com/clip.mp4", tmp_path)
        assert refused.value.permanent
        assert "unsupported url" in str(refused.value).lower()


class TestCredit:
    def test_a_handle_is_preferred(self):
        assert credit_of({"uploader_id": "@cafe_english", "channel": "Cafe English"}) == "@cafe_english"

    def test_a_channel_name_when_there_is_no_handle(self):
        assert credit_of({"uploader_id": "UC123", "channel": "Cafe English"}) == "Cafe English"

    def test_the_uploader_when_there_is_no_channel(self):
        assert credit_of({"uploader": "cafe.english", "uploader_id": "6712345"}) == "cafe.english"

    def test_nothing_known(self):
        assert credit_of({}) == ""


@pytest.mark.parametrize(
    "said, permanent",
    [
        ("Private video. Sign in if you've been granted access", True),
        ("Video unavailable. This video has been removed by the uploader", True),
        ("Not found.", True),
        ("Unable to download webpage: HTTP Error 404: Not Found", True),
        ("Unable to download webpage: <urlopen error [Errno 104] Connection reset by peer>", False),
        ("Sign in to confirm you're not a bot", False),
    ],
)
def test_what_the_site_said_decides_whether_to_try_again(said, permanent):
    assert bool(PERMANENT.search(said)) is permanent


def test_the_reason_is_what_the_site_said():
    message = "\x1b[0;31mERROR:\x1b[0m [youtube] abcDEF12345: Private video. Sign in if you've been granted access"
    assert reason_of(message) == "Private video. Sign in if you've been granted access"
