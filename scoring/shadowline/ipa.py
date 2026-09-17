"""Turning words into IPA, from CMUdict.

A dictionary rather than a model: the pronunciations are the ones lexicographers
wrote down, they are the same every run, and looking one up costs nothing. The
price is that a word CMUdict has never heard of gets no transcription at all —
which is the honest answer, and better than a guess a learner would practise.

CMUdict is ARPAbet, so the table below is the whole translation. Stress markers
(the digits) become the IPA stress marks, which is the part a learner shadowing
a line actually needs: which syllable carries the beat.
"""

from __future__ import annotations

import functools
import re

# ARPAbet phoneme -> IPA. Two-letter symbols first is irrelevant here because
# CMUdict hands them over already separated.
ARPABET_TO_IPA = {
    "AA": "ɑ", "AE": "æ", "AH": "ʌ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ",
    "B": "b", "CH": "tʃ", "D": "d", "DH": "ð",
    "EH": "ɛ", "ER": "ɝ", "EY": "eɪ",
    "F": "f", "G": "ɡ", "HH": "h",
    "IH": "ɪ", "IY": "i", "JH": "dʒ",
    "K": "k", "L": "l", "M": "m", "N": "n", "NG": "ŋ",
    "OW": "oʊ", "OY": "ɔɪ",
    "P": "p", "R": "ɹ", "S": "s", "SH": "ʃ",
    "T": "t", "TH": "θ",
    "UH": "ʊ", "UW": "u",
    "V": "v", "W": "w", "Y": "j", "Z": "z", "ZH": "ʒ",
}

# An unstressed schwa is written ə rather than ʌ. CMUdict spells both AH; the
# digit is what tells them apart, and "about" beginning with ʌ would be wrong.
UNSTRESSED_AH = "ə"

PRIMARY_STRESS = "ˈ"
SECONDARY_STRESS = "ˌ"

# Which IPA sounds are vowels, so the consonants opening a syllable can be told
# from the ones closing the one before it. Derived from the table rather than
# listed again, so the two cannot drift apart.
# The consonant clusters English allows at the start of a syllable. Needed
# because the mark goes before the onset, and a greedy "move every consonant"
# writes computer as kəˈmpjutɝ — no English syllable opens with mpj, and the
# beat starts at pju. Anything not listed falls back to a single consonant.
# Written in IPA, not spelling: R is ɹ here, so "br" would never match the bɹ
# the table above produces.
ONSETS = frozenset(
    """
    pl pɹ pj bl bɹ bj tɹ tw tj dɹ dw dj kl kɹ kw kj ɡl ɡɹ ɡw ɡj
    fl fɹ fj vj θɹ θw sl sm sn sp st sk sw sj ʃɹ ʃl mj nj lj hj
    spl spɹ stɹ skɹ skw spj stj skj
    """.split()
)

VOWELS = frozenset(
    ARPABET_TO_IPA[symbol]
    for symbol in ("AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW")
) | {UNSTRESSED_AH}

_WORD = re.compile(r"[a-z']+")


@functools.lru_cache(maxsize=1)
def _dictionary() -> dict[str, list[list[str]]]:
    import cmudict

    return cmudict.dict()


def for_word(word: str) -> str:
    """IPA for one word, or "" when CMUdict does not have it.

    Empty is deliberate. A learner practising a made-up pronunciation is worse
    off than one practising none, and the studio's IPA field is optional.
    """
    cleaned = _WORD.search(word.lower().strip())
    if not cleaned:
        return ""
    entries = _dictionary().get(cleaned.group(0))
    if not entries:
        return ""
    return _translate(entries[0])


def for_line(line: str) -> str:
    """IPA for a whole line, word by word, in one pair of slashes.

    A word with no entry is dropped rather than left as spelling: mixing the two
    reads as though the spelling were a transcription.
    """
    parts = [for_word(word) for word in line.split()]
    spoken = [part for part in parts if part]
    if not spoken:
        return ""
    return "/" + " ".join(spoken) + "/"


def _translate(phonemes: list[str]) -> str:
    """One CMUdict entry to IPA, with each stress mark in front of its syllable.

    ARPAbet marks stress with a digit on the vowel; IPA puts the mark before the
    whole syllable, consonants included. So "hello" is həˈloʊ, not həlˈoʊ — the
    l belongs to the stressed syllable, and a learner reading the mark is being
    told where the beat starts.
    """
    syllables: list[tuple[str, list[str]]] = []  # (stress mark, sounds)
    current: list[str] = []
    stress = ""

    for phoneme in phonemes:
        symbol, digit = phoneme[:-1], phoneme[-1]
        if not digit.isdigit():
            symbol, digit = phoneme, ""

        sound = ARPABET_TO_IPA.get(symbol, "")
        if not sound:
            continue
        if symbol == "AH" and digit == "0":
            sound = UNSTRESSED_AH

        if digit:
            # A vowel opens a new syllable. Whatever consonants came before it
            # are sitting at the end of the previous one; the pass below moves
            # them where they belong.
            syllables.append((stress, current))
            stress = {"1": PRIMARY_STRESS, "2": SECONDARY_STRESS}.get(digit, "")
            current = [sound]
        else:
            current.append(sound)

    syllables.append((stress, current))
    _move_onsets(syllables)

    return "".join(mark + "".join(sounds) for mark, sounds in syllables if mark or sounds)


def _move_onsets(syllables: list[tuple[str, list[str]]]) -> None:
    """Moves the consonants that open a stressed syllable in front of its mark.

    Only stressed syllables are moved, because the mark is the only thing whose
    position is visible: everything else concatenates to the same string either
    way, and guessing syllable divisions nobody can see would be effort spent on
    nothing.
    """
    for i in range(1, len(syllables)):
        mark, sounds = syllables[i]
        if not mark:
            continue
        previous_mark, previous = syllables[i - 1]

        available = 0
        while available < len(previous) and previous[len(previous) - 1 - available] not in VOWELS:
            available += 1
        if available == 0:
            continue

        # Longest legal cluster first, then shorter ones. A single consonant is
        # always an onset — except ŋ, which no English syllable opens with.
        onset = 0
        for size in range(min(available, 3), 0, -1):
            cluster = "".join(previous[len(previous) - size:])
            if cluster in ONSETS or (size == 1 and cluster != "ŋ"):
                onset = size
                break
        if onset == 0:
            continue

        split = len(previous) - onset
        syllables[i - 1] = (previous_mark, previous[:split])
        syllables[i] = (mark, previous[split:] + sounds)
