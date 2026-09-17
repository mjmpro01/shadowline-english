import type { TranscriptWord } from '../data/types'

/**
 * Which words belong to a clip, given where it was cut.
 *
 * A word's middle decides, not its start or its end, so one straddling a cut
 * goes to the side holding most of it. Using the start would hand the next clip
 * a word it barely contains; counting any overlap would put the same word in
 * both, and a learner would shadow it twice.
 *
 * The end is exclusive, so a word whose middle lands exactly on a boundary
 * belongs to the clip after it and never to both.
 *
 * This is the same rule as `words_between` in scoring/shadowline/transcribe.py,
 * and has to stay that way: the worker maps words to clips when it has them,
 * and the studio maps them again whenever the admin moves a boundary. The
 * Python tests and app/test/transcript.test.ts both pin it.
 */
export function wordsBetween(
  words: TranscriptWord[],
  start: number,
  end: number,
): TranscriptWord[] {
  return words.filter((word) => {
    const middle = (word.start + word.end) / 2
    return middle >= start && middle < end
  })
}

/**
 * The words as a line to read. Whisper attaches punctuation to the word it
 * follows, so joining on spaces needs no detokenising.
 */
export function lineOf(words: TranscriptWord[]): string {
  return words.map((word) => word.text).join(' ').trim()
}

/**
 * The line's pronunciation, in one pair of slashes.
 *
 * A word CMUdict does not have contributes nothing rather than its spelling:
 * spelling mixed into a transcription reads as though it were one.
 */
export function ipaOf(words: TranscriptWord[]): string {
  const spoken = words.map((word) => word.ipa).filter(Boolean)
  return spoken.length ? `/${spoken.join(' ')}/` : ''
}
