"""Contractions and possessives, written here rather than looked up.

The FreeTalk Dictionary has no entry with an apostrophe in it — not one — and
in a shadowing app that is the worst possible gap. Captions of real speech are
made of `it's`, `don't`, `i'm`, `you're`, `that's`, `can't`. Measured against
the 12,000 commonest words, 134 of the 1,371 the dictionary could not answer
were apostrophe words, and they sit far higher up the frequency list than the
rest of the gap.

They are also the easiest words in English to define correctly without asking
anybody, which is why they are a table rather than an API call. A contraction
means the words it is short for. A possessive means belonging to its noun.

Written in the style the dictionary uses: sentence case, no trailing full stop,
one clause.
"""

from __future__ import annotations

SOURCE = "shadowline"

# What each contraction is short for. Where a form is ambiguous — `he's` is
# both "he is" and "he has", `i'd` is both "I would" and "I had" — both are
# given, because a learner meeting it in a caption needs to know it can be
# either.
CONTRACTIONS = {
    "i'm": "Short for 'I am'",
    "i've": "Short for 'I have'",
    "i'll": "Short for 'I will'",
    "i'd": "Short for 'I would' or 'I had'",
    "you're": "Short for 'you are'",
    "you've": "Short for 'you have'",
    "you'll": "Short for 'you will'",
    "you'd": "Short for 'you would' or 'you had'",
    "he's": "Short for 'he is' or 'he has'",
    "he'll": "Short for 'he will'",
    "he'd": "Short for 'he would' or 'he had'",
    "she's": "Short for 'she is' or 'she has'",
    "she'll": "Short for 'she will'",
    "she'd": "Short for 'she would' or 'she had'",
    "it's": "Short for 'it is' or 'it has'",
    "it'll": "Short for 'it will'",
    "it'd": "Short for 'it would' or 'it had'",
    "we're": "Short for 'we are'",
    "we've": "Short for 'we have'",
    "we'll": "Short for 'we will'",
    "we'd": "Short for 'we would' or 'we had'",
    "they're": "Short for 'they are'",
    "they've": "Short for 'they have'",
    "they'll": "Short for 'they will'",
    "they'd": "Short for 'they would' or 'they had'",
    "that's": "Short for 'that is' or 'that has'",
    "that'll": "Short for 'that will'",
    "that'd": "Short for 'that would' or 'that had'",
    "there's": "Short for 'there is' or 'there has'",
    "here's": "Short for 'here is'",
    "what's": "Short for 'what is' or 'what has'",
    "who's": "Short for 'who is' or 'who has'",
    "who've": "Short for 'who have'",
    "how's": "Short for 'how is' or 'how has'",
    "where's": "Short for 'where is' or 'where has'",
    "let's": "Short for 'let us', used to suggest doing something together",
    "don't": "Short for 'do not'",
    "doesn't": "Short for 'does not'",
    "didn't": "Short for 'did not'",
    "isn't": "Short for 'is not'",
    "aren't": "Short for 'are not'",
    "wasn't": "Short for 'was not'",
    "weren't": "Short for 'were not'",
    "haven't": "Short for 'have not'",
    "hasn't": "Short for 'has not'",
    "hadn't": "Short for 'had not'",
    "can't": "Short for 'cannot'",
    "couldn't": "Short for 'could not'",
    "won't": "Short for 'will not'",
    "wouldn't": "Short for 'would not'",
    "shouldn't": "Short for 'should not'",
    "would've": "Short for 'would have'",
    "could've": "Short for 'could have'",
    "should've": "Short for 'should have'",
    "ain't": "Informal short form of 'is not', 'are not' or 'have not'",
    "c'mon": "Informal short form of 'come on'",
    "o'clock": "Used after a number to say the hour of the day",
    "one's": "Belonging to a person in general",
    "else's": "Belonging to somebody else, as in 'someone else's'",
}


def possessive_of(word: str) -> str | None:
    """The definition of a possessive form, or None when it is not one.

    `women's`, `today's`, `america's` — the apostrophe-s forms are most of what
    the dictionary is missing, and they mean exactly one thing. Saying so beats
    leaving the commonest words in a caption blank.

    The base is not checked against anything: `mcdonald's` and `obama's` are as
    much possessives as `mother's` is, and the sentence is true either way.
    """
    if not word.endswith("'s") or word in CONTRACTIONS:
        return None
    base = word[:-2]
    if not base or "'" in base:
        return None
    return f"Belonging to or relating to {base}"


def entries(words: list[str]) -> dict[str, str]:
    """Every word in the list this module can define."""
    found = {}
    for word in words:
        if word in CONTRACTIONS:
            found[word] = CONTRACTIONS[word]
            continue
        possessive = possessive_of(word)
        if possessive:
            found[word] = possessive
    return found
