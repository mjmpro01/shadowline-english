"""The word-lookup worker against a real database and a stand-in for the model.

The model itself is not called here — that costs money and gives a different
sentence every run. What is worth pinning is everything around it: that a gloss
is written once and the job disappears with it, that a word CMUdict knows still
gets its pronunciation when there is no model at all, and that a lookup which
cannot work gives up instead of spinning for ever in front of a learner.
"""

import pytest

from shadowline.gloss import GlossFailed, _tidy, gloss
from shadowline.glosser import run_once
from shadowline.glossqueue import MAX_ATTEMPTS, GlossQueue


class FakeGlosser:
    """Answers with whatever it was told to, and remembers what it was asked."""

    def __init__(self, answer: str = "very good or very clever") -> None:
        self.answer = answer
        self.asked: list[tuple[str, str]] = []

    def meaning(self, word: str, context: str) -> str:
        self.asked.append((word, context))
        if isinstance(self.answer, Exception):
            raise self.answer
        return self.answer


def queue_word(conn, word: str, context: str = "") -> None:
    conn.execute("insert into gloss_jobs (word, context) values (%s, %s)", (word, context))


def stored(conn, word: str):
    return conn.execute(
        "select ipa, meaning from glosses where word = %s", (word,)
    ).fetchone()


def jobs(conn) -> int:
    return conn.execute("select count(*) from gloss_jobs").fetchone()[0]


def test_a_queued_word_is_glossed_and_written_back(db):
    queue_word(db, "brilliant", "The team came up with a brilliant plan.")
    model = FakeGlosser()

    assert run_once(GlossQueue(db), model) is True

    said, meaning = stored(db, "brilliant")
    assert said == "ˈbɹɪljənt", f"pronunciation is {said!r}"
    assert meaning == "very good or very clever"
    # Gone with the gloss, so the word is never both looked up and still queued.
    assert jobs(db) == 0


def test_the_sentence_reaches_the_model(db):
    """The whole reason a dictionary was not enough: which sense was meant."""
    queue_word(db, "really", "Are you really going?")
    model = FakeGlosser()

    run_once(GlossQueue(db), model)

    assert model.asked == [("really", "Are you really going?")]


def test_a_word_tapped_outside_a_caption_is_still_looked_up(db):
    queue_word(db, "worth")
    model = FakeGlosser()

    run_once(GlossQueue(db), model)

    assert model.asked == [("worth", "")]
    assert stored(db, "worth")[1] == "very good or very clever"


def test_without_a_model_the_pronunciation_still_lands(db):
    """A deployment with no API key is not a broken one: CMUdict is free, and a
    popup showing how to say the word is worth more than an empty card."""
    queue_word(db, "question")

    assert run_once(GlossQueue(db), None) is True

    said, meaning = stored(db, "question")
    assert said == "ˈkwɛstʃən", f"pronunciation is {said!r}"
    assert meaning == ""


def test_a_word_cmudict_has_never_heard_of_keeps_its_meaning(db):
    """The two halves are looked up independently, so one missing does not take
    the other with it. A name or a coinage has a meaning and no entry."""
    queue_word(db, "shadowline")
    model = FakeGlosser("the app you are using")

    run_once(GlossQueue(db), model)

    said, meaning = stored(db, "shadowline")
    assert meaning == "the app you are using"
    # No guess at how to say it. A spelling in slashes reads as a transcription.
    assert said == "", f"pronunciation is {said!r}"


def test_a_refused_word_gives_up_rather_than_spinning(db):
    """With no gloss and no job the word reports "none", and the popup says so
    instead of waiting for something that is never coming."""
    queue_word(db, "brilliant")
    model = FakeGlosser()
    model.answer = GlossFailed("the model declined to define this word")

    for _ in range(MAX_ATTEMPTS):
        assert run_once(GlossQueue(db), model) is True

    assert jobs(db) == 0
    assert stored(db, "brilliant") is None


def test_a_failure_is_retried_before_it_is_given_up_on(db):
    queue_word(db, "brilliant")
    model = FakeGlosser()
    model.answer = GlossFailed("nope")

    run_once(GlossQueue(db), model)

    assert jobs(db) == 1, "one failure should not spend the whole budget"


def test_an_empty_queue_is_not_an_error(db):
    assert run_once(GlossQueue(db), FakeGlosser()) is False


def test_a_second_learner_tapping_the_same_word_is_one_job(db):
    """The cache is the point: a word half the class taps at once is one API
    call, not thirty."""
    queue_word(db, "brilliant")
    db.execute(
        "insert into gloss_jobs (word, context) values ('brilliant', 'other line')"
        " on conflict (word) do nothing"
    )

    assert jobs(db) == 1


def test_an_empty_answer_is_not_written_down(db):
    queue_word(db, "brilliant")

    with pytest.raises(GlossFailed):
        gloss("brilliant", "", FakeGlosser(""))


@pytest.mark.parametrize(
    "raw, want",
    [
        ("very good or very clever", "very good or very clever"),
        # The model is told not to, and mostly does not.
        ('"very good or very clever"', "very good or very clever"),
        ("Definition: very good", "very good"),
        ("very good.", "very good"),
        ("very good\n\nAlso used for...", "very good"),
        ("   ", ""),
    ],
)
def test_the_decorations_are_stripped(raw, want):
    assert _tidy(raw) == want
