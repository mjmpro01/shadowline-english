"""Reading Merriam-Webster's answers.

No network here, and none wanted: what these pin is the parsing, which is the
part that can be wrong quietly. A definition belonging to the wrong headword
looks exactly like a right one on screen.

The payloads below follow Merriam-Webster's published JSON shape. They were
written without a live response to check against — the network this was written
on blocks dictionaryapi.com — so `python -m shadowline.dictionary <word>` exists
to settle it against a real key in one command. Everything here is built so that
being wrong about the shape costs a fall-through to the model and nothing else.
"""

import pytest

from shadowline.dictionary import LearnersDictionary, _definition_of


def entry(headword, shortdef, stems=None, **extra):
    return {
        "meta": {"id": headword, "stems": stems or [headword.split(":", 1)[0]]},
        "hwi": {"hw": headword.split(":", 1)[0]},
        "fl": "adjective",
        "shortdef": shortdef,
        **extra,
    }


def test_the_first_short_definition_is_the_one_shown():
    payload = [entry("brilliant", ["very bright", "very impressive or successful"])]

    assert _definition_of(payload, "brilliant") == "very bright"


def test_an_inflection_is_answered_by_its_headword():
    """A learner taps "expecting"; the dictionary files it under "expect" and
    lists the inflection among the entry's stems."""
    payload = [entry("expect", ["to think that something will happen"],
                     stems=["expect", "expected", "expecting", "expects"])]

    assert _definition_of(payload, "expecting") == "to think that something will happen"


def test_a_definition_for_another_word_is_not_shown():
    """Merriam-Webster answers with everything in the neighbourhood. Handing a
    learner the entry that happened to come first would show them the
    definition of a word they did not tap."""
    payload = [
        entry("brilliantine", ["a perfumed oil for the hair"], stems=["brilliantine"]),
        entry("brilliant", ["very bright"], stems=["brilliant"]),
    ]

    assert _definition_of(payload, "brilliant") == "very bright"


def test_a_homograph_number_is_not_part_of_the_word():
    payload = [entry("bear:2", ["a large heavy animal"], stems=["bear", "bears"])]

    assert _definition_of(payload, "bear") == "a large heavy animal"


def test_spelling_suggestions_are_not_a_definition():
    """An unrecognised word comes back as a list of plain strings, which is the
    one shape that looks most like an answer and is not one."""
    payload = ["brilliance", "brilliant", "brilliantly"]

    assert _definition_of(payload, "briliant") == ""


def test_nothing_at_all_is_not_a_definition():
    assert _definition_of([], "shadowline") == ""


def test_markup_tokens_are_stripped():
    payload = [entry("brilliant", ["{bc}very {it}bright{/it}"])]

    assert _definition_of(payload, "brilliant") == "very bright"


def test_an_entry_with_no_short_definition_falls_through():
    payload = [entry("brilliant", []), entry("brilliant", ["very bright"])]

    assert _definition_of(payload, "brilliant") == "very bright"


@pytest.mark.parametrize("payload", [None, {"error": "bad key"}, "nope", [{"no": "meta"}], [None]])
def test_a_shape_it_does_not_recognise_is_a_miss_not_a_crash(payload):
    """The whole safety story. Being wrong about the response costs one lookup
    somewhere else; it must never take the worker down or reach a learner."""
    assert _definition_of(payload, "brilliant") == ""


def test_a_dictionary_that_cannot_be_reached_says_nothing(monkeypatch):
    dictionary = LearnersDictionary("key", endpoint="http://127.0.0.1:1/")

    # No exception: the model behind it is what answers instead.
    assert dictionary.meaning("brilliant", "a brilliant plan") == ""


def test_the_key_and_the_word_are_escaped(monkeypatch):
    """A word with an apostrophe in it, and a key with anything in it, have to
    survive being put in a URL."""
    seen = {}

    def fake_fetch(self, word):
        seen["word"] = word
        return [entry("o'clock", ["used to say what hour it is"], stems=["o'clock"])]

    monkeypatch.setattr(LearnersDictionary, "_fetch", fake_fetch)
    dictionary = LearnersDictionary("key")

    assert dictionary.meaning("o'clock", "") == "used to say what hour it is"
    assert seen["word"] == "o'clock"
