"""Matching what was heard against the line the clip asked for."""

import pytest

from shadowline.words import FLOOR, check, gate, normalise


def heard(line: str) -> list[str]:
    return line.split()


class TestNormalise:
    def test_drops_case_and_punctuation(self):
        assert normalise("Actually, I think it's BRILLIANT!") == [
            "actually",
            "i",
            "think",
            "it's",
            "brilliant",
        ]

    def test_keeps_the_apostrophe_inside_a_word(self):
        # "its" and "it's" are two words, and a learner who said the wrong one
        # said the wrong one.
        assert normalise("it's") != normalise("its")

    def test_folds_the_curly_apostrophe_onto_the_straight_one(self):
        # A caption pasted from a word processor is the same line as one typed
        # in the studio.
        assert normalise("it’s") == normalise("it's")

    def test_a_line_of_punctuation_has_no_words(self):
        assert normalise(" — ... ! ") == []


class TestCheck:
    def test_every_word_heard(self):
        got = check("We were on a break", heard("we were on a break"))
        assert got.accuracy == 1.0
        assert [ok for _, ok in got.line] == [True] * 5

    def test_names_the_word_that_was_dropped(self):
        got = check("We were on a break", heard("we were on break"))
        assert dict(got.line)["a"] is False
        assert got.accuracy == pytest.approx(0.8)

    def test_a_word_said_instead_does_not_count_as_the_word_expected(self):
        got = check("I think it's brilliant", heard("i think it's brilliant"))
        assert got.accuracy == 1.0
        wrong = check("I think it's brilliant", heard("i think it's brutal"))
        assert dict(wrong.line)["brilliant"] is False

    def test_a_repeated_word_is_counted_twice_or_not_at_all(self):
        # A set intersection would score both copies of "it's" from one, which
        # is the whole reason this is an alignment.
        line = "it's not about winning it's about showing up"
        both = check(line, heard(line))
        assert both.accuracy == 1.0

        once = check(line, heard("it's not about winning about showing up"))
        said = [ok for _, ok in once.line]
        assert said.count(True) == 7 and said.count(False) == 1

    def test_extra_words_do_not_lower_the_score(self):
        # Saying the line and then apologising to the microphone is still
        # saying the line.
        got = check("We were on a break", heard("um we were on a break sorry"))
        assert got.accuracy == 1.0

    def test_the_caption_keeps_its_own_spelling(self):
        # What comes back is drawn under the line on screen, so it has to read
        # the way the caption reads — punctuation and capitals included.
        got = check("We were on a break!", heard("we were on a break"))
        assert [text for text, _ in got.line] == ["We", "were", "on", "a", "break!"]

    def test_nothing_heard_is_not_a_score_of_zero(self):
        # An empty transcript is a quiet room at least as often as it is
        # silence, and a learner should not lose a score over the difference.
        assert check("We were on a break", []) is None

    def test_a_clip_with_no_line_has_nothing_to_check(self):
        assert check("", heard("we were on a break")) is None


class TestGate:
    def test_saying_the_whole_line_leaves_the_score_alone(self):
        assert gate(88, 1.0) == 88

    def test_saying_none_of_it_keeps_only_the_floor(self):
        assert gate(88, 0.0) == round(88 * FLOOR)

    def test_half_the_line_lands_between_the_two(self):
        assert gate(88, 0.0) < gate(88, 0.5) < gate(88, 1.0)

    def test_an_accuracy_outside_the_range_is_clamped(self):
        assert gate(88, 2.0) == 88
        assert gate(88, -1.0) == round(88 * FLOOR)
