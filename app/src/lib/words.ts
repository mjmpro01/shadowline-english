import type { CaptionLine, WordCheck } from '../data/types'
import { captionWords } from './text'

/**
 * The word check's marks for one caption of a clip.
 *
 * A take covers the whole clip, so the check runs over every caption joined
 * together, while the Practice screen shows one caption at a time. This is the
 * offset between the two.
 *
 * Undefined rather than a guess when the two disagree about how many words the
 * clip has. The server and the browser split a line the same way and should
 * never disagree, but if they ever do, marking the wrong word as missing is
 * worse than marking nothing: it tells a learner they dropped a word they said.
 */
export function heardIn(
  check: WordCheck | undefined,
  captions: CaptionLine[],
  index: number,
): (boolean | undefined)[] | undefined {
  if (!check) return undefined
  const counts = captions.map((caption) => captionWords(caption.text).length)
  const total = counts.reduce((sum, n) => sum + n, 0)
  if (total !== check.line.length) return undefined

  const from = counts.slice(0, index).reduce((sum, n) => sum + n, 0)
  return check.line.slice(from, from + (counts[index] ?? 0)).map((word) => word.heard)
}

/** How much of the line came back, as two counts rather than a percentage:
 *  "7 of 9" is a thing to go and fix and "78%" is a grade. */
export function heardCount(check: WordCheck): { heard: number; total: number } {
  return {
    heard: check.line.filter((word) => word.heard).length,
    total: check.line.length,
  }
}
