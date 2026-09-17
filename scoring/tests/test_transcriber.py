"""The transcription worker against a real database and a real object store.

Whisper itself stands behind the Transcriber protocol and is replaced here. What
these check is everything around it — claiming, retrying, giving up, IPA, and
which words belong to which clip — because that is the part with decisions in
it. The model's own accuracy is not something a test of ours would establish.
"""

from pathlib import Path

import pytest

from shadowline.transcribe import (
    TranscribeFailed,
    Transcription,
    Word,
    line_of,
    words_between,
)
from shadowline.transcribequeue import MAX_ATTEMPTS, TranscribeQueue
from shadowline.transcriber import run_once

SPOKEN = [
    Word(0.10, 0.45, "One"),
    Word(0.50, 0.90, "step"),
    Word(1.00, 1.20, "at"),
    Word(1.25, 1.35, "a"),
    Word(1.40, 1.90, "time."),
    Word(3.10, 3.60, "It"),
    Word(3.65, 4.10, "was"),
    Word(4.20, 4.80, "worth"),
    Word(4.85, 5.10, "it."),
]


class FakeTranscriber:
    def __init__(self, words=None, fails=False):
        self.words = SPOKEN if words is None else words
        self.fails = fails
        self.calls = 0

    def transcribe(self, path: Path) -> Transcription:
        self.calls += 1
        if self.fails:
            raise TranscribeFailed("no speech found")
        return Transcription(language="en", words=list(self.words))


def seed(conn, root: Path, *, present=True):
    """A source and its transcription job, as the API would have written them."""
    key = "source/one.mp4"
    if present:
        (root / "clips" / "source").mkdir(parents=True, exist_ok=True)
        (root / "clips" / key).write_bytes(b"pretend recording")

    source_id = conn.execute(
        "insert into clip_sources (name, key, content_type) values ('lecture', %s, 'video/mp4') returning id",
        (key,),
    ).fetchone()[0]
    conn.execute("insert into transcribe_jobs (source_id) values (%s)", (source_id,))
    return source_id


def transcript(conn, source_id):
    return conn.execute(
        "select language, words from transcripts where source_id = %s", (source_id,)
    ).fetchone()


def test_a_queued_source_is_transcribed_and_written_back(db, blobs, tmp_path):
    store, root = blobs
    source_id = seed(db, root)

    assert run_once(TranscribeQueue(db), store, FakeTranscriber(), tmp_path) is True

    language, words = transcript(db, source_id)
    assert language == "en"
    assert len(words) == len(SPOKEN)
    assert words[0]["text"] == "One"
    assert words[0]["start"] == pytest.approx(0.10)

    # The job is gone, so the studio stops waiting and no worker repeats it.
    assert db.execute("select count(*) from transcribe_jobs").fetchone()[0] == 0


def test_every_word_carries_its_ipa(db, blobs, tmp_path):
    """Looked up on the worker, so the browser never ships a hundred thousand
    dictionary entries to save a join."""
    store, root = blobs
    source_id = seed(db, root)

    run_once(TranscribeQueue(db), store, FakeTranscriber(), tmp_path)

    _, words = transcript(db, source_id)
    by_text = {word["text"]: word["ipa"] for word in words}
    assert by_text["step"] == "ˈstɛp"
    assert by_text["One"] == "ˈwʌn"
    # Punctuation attached by Whisper must not defeat the lookup.
    assert by_text["time."] == "ˈtaɪm"


def test_an_empty_queue_is_not_an_error(db, blobs, tmp_path):
    store, _ = blobs
    assert run_once(TranscribeQueue(db), store, FakeTranscriber(), tmp_path) is False


def test_a_recording_that_cannot_be_transcribed_is_given_up_on(db, blobs, tmp_path):
    """And the studio goes back to what it always did: the admin types the
    lines. Nothing else about the upload is affected."""
    store, root = blobs
    source_id = seed(db, root)
    queue, transcriber = TranscribeQueue(db), FakeTranscriber(fails=True)

    for _ in range(MAX_ATTEMPTS):
        assert run_once(queue, store, transcriber, tmp_path) is True

    assert transcript(db, source_id) is None
    assert db.execute("select count(*) from transcribe_jobs").fetchone()[0] == 0
    # The source row itself survives, because its clips still point at it.
    assert db.execute("select count(*) from clip_sources").fetchone()[0] == 1


def test_a_missing_recording_stops_being_retried(db, blobs, tmp_path):
    store, root = blobs
    source_id = seed(db, root, present=False)
    queue, transcriber = TranscribeQueue(db), FakeTranscriber()

    for _ in range(MAX_ATTEMPTS):
        assert run_once(queue, store, transcriber, tmp_path) is True

    assert transcript(db, source_id) is None
    assert transcriber.calls == 0, "a missing file should never reach the model"


def test_one_recording_is_transcribed_once_for_all_of_its_clips(db, blobs, tmp_path):
    """The reason a transcript belongs to the source and not to each clip."""
    store, root = blobs
    seed(db, root)
    transcriber = FakeTranscriber()
    queue = TranscribeQueue(db)

    assert run_once(queue, store, transcriber, tmp_path) is True
    assert run_once(queue, store, transcriber, tmp_path) is False

    assert transcriber.calls == 1


class TestWordsBetween:
    """Which words belong to a clip, given where it was cut."""

    def test_takes_the_words_inside_the_boundaries(self):
        assert line_of(words_between(SPOKEN, 0.0, 2.0)) == "One step at a time."
        assert line_of(words_between(SPOKEN, 3.0, 5.5)) == "It was worth it."

    def test_a_word_straddling_a_cut_goes_to_the_side_holding_most_of_it(self):
        # "step" runs 0.50–0.90, so its middle is 0.70. A cut at 0.80 leaves
        # most of the word behind it, and that is where the word goes.
        # The end is exclusive, so a word whose middle lands exactly on a
        # boundary belongs to the clip after it, never to both.
        assert line_of(words_between(SPOKEN, 0.0, 0.80)) == "One step"
        assert line_of(words_between(SPOKEN, 0.80, 1.38)) == "at a"

    def test_no_word_lands_in_two_clips(self):
        first = words_between(SPOKEN, 0.0, 2.0)
        second = words_between(SPOKEN, 2.0, 6.0)
        assert not {word.text for word in first} & {word.text for word in second}
        assert len(first) + len(second) == len(SPOKEN)

    def test_a_gap_with_no_speech_in_it_is_an_empty_line(self):
        assert words_between(SPOKEN, 2.0, 3.0) == []
        assert line_of([]) == ""
