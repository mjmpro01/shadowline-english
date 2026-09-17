"""IPA from CMUdict.

No database and no model: this is a dictionary lookup and a table, so it is
checked against pronunciations anyone can verify by reading them aloud.
"""

import pytest

from shadowline import ipa


@pytest.mark.parametrize(
    "word,expected",
    [
        ("hello", "həˈloʊ"),
        ("about", "əˈbaʊt"),
        ("winning", "ˈwɪnɪŋ"),
        ("question", "ˈkwɛstʃən"),
        ("singer", "ˈsɪŋɝ"),
    ],
)
def test_common_words(word, expected):
    assert ipa.for_word(word) == expected


# The mark goes before the whole syllable, consonants included: hello is həˈloʊ,
# never həlˈoʊ. It is the one thing in the output whose position is visible, and
# it is what tells a learner where the beat starts.
@pytest.mark.parametrize(
    "word,expected",
    [
        ("brilliant", "ˈbɹɪljənt"),
        ("strong", "ˈstɹɔŋ"),
        ("split", "ˈsplɪt"),
        ("surprise", "sɝˈpɹaɪz"),
    ],
)
def test_the_stress_mark_opens_its_syllable(word, expected):
    assert ipa.for_word(word) == expected


# Only clusters English actually opens a syllable with move in front of the
# mark. A greedy move writes computer as kəˈmpjutɝ, and no syllable opens mpj.
@pytest.mark.parametrize(
    "word,expected",
    [
        ("computer", "kəmˈpjutɝ"),
        ("complete", "kəmˈplit"),
        ("extra", "ˈɛkstɹə"),
    ],
)
def test_only_legal_onsets_move(word, expected):
    assert ipa.for_word(word) == expected


# CMUdict spells both the schwa in "about" and the vowel in "cup" as AH; the
# stress digit is the only thing telling them apart.
def test_an_unstressed_ah_is_a_schwa():
    assert ipa.for_word("about").startswith("ə")
    assert "ʌ" in ipa.for_word("cup")


def test_a_word_it_has_never_heard_of_gets_nothing():
    """Empty, not a guess. A learner practising an invented pronunciation is
    worse off than one practising none, and the field is optional."""
    assert ipa.for_word("zzzqqx") == ""
    assert ipa.for_word("") == ""
    assert ipa.for_word("   ") == ""


def test_case_and_punctuation_do_not_matter():
    assert ipa.for_word("Hello,") == ipa.for_word("hello")
    assert ipa.for_word("ABOUT") == ipa.for_word("about")


def test_a_line_is_transcribed_word_by_word_in_one_pair_of_slashes():
    line = ipa.for_line("One step at a time")
    assert line.startswith("/") and line.endswith("/")
    assert line == "/ˈwʌn ˈstɛp ˈæt ə ˈtaɪm/"


def test_a_line_drops_the_words_it_does_not_know():
    """Rather than leaving them as spelling, which reads as though the spelling
    were a transcription."""
    line = ipa.for_line("hello zzzqqx")
    assert "zzzqqx" not in line
    assert line == "/həˈloʊ/"


def test_a_line_of_nothing_it_knows_is_empty_rather_than_empty_slashes():
    assert ipa.for_line("zzzqqx xyzzy") == ""
    assert ipa.for_line("") == ""
