"""The apostrophe words.

Written by hand rather than looked up, because no dictionary we found has them
and they are the words a caption of real speech is made of. What is worth
pinning is that the table says what it means to say, and that the possessive
rule cannot run away with words that are not possessives.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

import contractions  # noqa: E402


def test_the_commonest_contractions_are_all_covered():
    """These are the ones a shadowing app meets on nearly every line."""
    for word in ["it's", "don't", "i'm", "you're", "that's", "can't", "i've",
                 "didn't", "isn't", "won't", "let's", "there's", "what's"]:
        assert word in contractions.CONTRACTIONS, word


def test_an_ambiguous_contraction_says_it_is_ambiguous():
    """`he's` is both "he is" and "he has", and a learner meeting it in a
    caption has no way to tell unless the definition says so."""
    assert contractions.CONTRACTIONS["he's"] == "Short for 'he is' or 'he has'"
    assert contractions.CONTRACTIONS["i'd"] == "Short for 'I would' or 'I had'"


def test_cannot_is_one_word():
    """The one contraction whose expansion is not two words."""
    assert contractions.CONTRACTIONS["can't"] == "Short for 'cannot'"


def test_a_possessive_is_explained_as_one():
    assert contractions.possessive_of("women's") == "Belonging to or relating to women"
    assert contractions.possessive_of("today's") == "Belonging to or relating to today"


def test_a_contraction_is_never_treated_as_a_possessive():
    """`it's` and `that's` end in apostrophe-s and are not possessives. Reading
    them as ones would tell a learner that `it's` means belonging to it."""
    for word in ["it's", "that's", "there's", "what's", "he's", "let's", "one's"]:
        assert contractions.possessive_of(word) is None, word


def test_a_word_without_an_apostrophe_is_not_a_possessive():
    for word in ["brilliant", "women", "s", ""]:
        assert contractions.possessive_of(word) is None, word


def test_only_the_apostrophe_words_are_claimed():
    """The table must not shadow the dictionary for ordinary words."""
    found = contractions.entries(["brilliant", "it's", "women's", "gonna", "really"])

    assert set(found) == {"it's", "women's"}


def test_every_definition_reads_like_the_others():
    """Same shape as the dictionary's: sentence case, one clause, no trailing
    full stop. A popup showing two styles looks like two bugs."""
    for word, meaning in contractions.CONTRACTIONS.items():
        assert meaning, word
        assert not meaning.endswith("."), word
        assert meaning[0].isupper(), word
        assert len(meaning.split()) <= 15, word
