"""Matching what was heard against the line the clip asked for."""

import pytest

from shadowline.words import FLOOR, check, gate, normalise, recheck


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

    def test_nothing_heard_is_none_of_the_line(self):
        # An empty transcript used to be skipped, and a take with nobody in it
        # kept the score its background hum earned. Nothing heard is every word
        # missing; the floor in gate() is what is left of the score.
        got = check("We were on a break", [])
        assert got is not None
        assert got.accuracy == 0.0
        assert got.heard == []
        assert [text for text, ok in got.line if not ok] == ["We", "were", "on", "a", "break"]

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


class TestForgiving:
    """What a transcriber writes differently from the caption still counts."""

    def test_a_long_word_a_letter_off_is_the_word(self):
        got = check("I was walking home", heard("i was walkin home"))
        assert got.accuracy == 1.0
        got = check("What a beautiful colour", heard("what a beautiful color"))
        assert got.accuracy == 1.0

    def test_a_very_long_word_gets_two_letters(self):
        assert check("unbelievable", heard("unbelieveble")).accuracy == 1.0

    def test_a_short_word_has_to_be_exact(self):
        # "for" and "four", "a" and "the": a letter is most of a short word.
        assert dict(check("this is for you", heard("this is four you")).line)["for"] is False
        assert dict(check("on a break", heard("on the break")).line)["a"] is False

    def test_a_contraction_and_its_long_form_are_the_same_words(self):
        assert check("It's not about winning", heard("it is not about winning")).accuracy == 1.0
        assert check("It is not about winning", heard("it's not about winning")).accuracy == 1.0
        assert check("I don't know", heard("i do not know")).accuracy == 1.0
        assert check("We'll see", heard("we will see")).accuracy == 1.0
        assert check("She can't come", heard("she cannot come")).accuracy == 1.0

    def test_casual_forms_count(self):
        assert check("I'm going to do it", heard("i'm gonna do it")).accuracy == 1.0
        assert check("I wanna go", heard("i want to go")).accuracy == 1.0

    def test_he_d_is_would_or_had(self):
        assert check("He had gone", heard("he'd gone")).accuracy == 1.0

    def test_numbers_written_either_way(self):
        assert check("I have two cats", heard("i have 2 cats")).accuracy == 1.0
        assert check("Give me 5 minutes", heard("give me five minutes")).accuracy == 1.0

    def test_half_a_contraction_is_not_the_contraction(self):
        got = check("I don't know", heard("i do know"))
        assert dict(got.line)["don't"] is False

    def test_a_possessive_is_not_is(self):
        # "John's" is one word, not "John is": heard as "johns" it is a letter
        # off a long word and counts; heard as "john is" it does not.
        assert check("John's car", heard("johns car")).accuracy == 1.0

    def test_the_line_is_still_the_caption_s_own_words(self):
        got = check("It's gonna rain!", heard("it is going to rain"))
        assert [text for text, _ in got.line] == ["It's", "gonna", "rain!"]
        assert got.accuracy == 1.0


class TestRecheck:
    def test_a_stored_check_is_matched_again_with_today_s_rules(self):
        stored = {
            "accuracy": 0.6667,
            "heard": ["it", "is", "raining"],
            "line": [{"text": "It's", "heard": False}, {"text": "raining", "heard": True}],
        }
        got = recheck(stored)
        assert got.accuracy == 1.0
        assert [text for text, _ in got.line] == ["It's", "raining"]

    def test_a_malformed_check_is_left_alone(self):
        assert recheck({"heard": "nope"}) is None
