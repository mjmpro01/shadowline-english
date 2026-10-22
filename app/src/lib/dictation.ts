import { captionWords } from './text'

/**
 * Checking a dictation: what the learner wrote down against what was said.
 *
 * The words are lined up the way a diff lines up two files — the longest run
 * of words the two have in common, in order — and what is left over between
 * those is a word heard wrong, a word missed, or a word that was never said.
 * Two kinds of mistake are plain from the words alone and are named here: an
 * ending dropped or added (-s, -ed), and a short word (a, the, of) missed or
 * misheard. The rest only the learner can say — whether they did not know the
 * word, did not recognise it spoken, or lost it where it ran into the next.
 */

export type ErrorKind = 'missingEnding' | 'shortWord' | 'unknownWord' | 'sound' | 'linking' | 'other'

/** The kinds a learner tags by hand, in the order they are offered. */
export const SELF_KINDS: ErrorKind[] = ['unknownWord', 'sound', 'linking']

export const ERROR_KINDS: ErrorKind[] = ['missingEnding', 'shortWord', 'unknownWord', 'sound', 'linking', 'other']

export interface Token {
  /** As written, punctuation and all, for showing. */
  raw: string
  /** As compared. */
  word: string
}

export type Mark =
  | { kind: 'right'; expected: Token; typed: Token }
  | { kind: 'wrong'; expected: Token; typed: Token }
  | { kind: 'missing'; expected: Token }
  | { kind: 'extra'; typed: Token }

/** A word as compared: no capitals or punctuation, but its digits kept — a
 *  year heard wrong is a mistake too — and a curly apostrophe taken for the
 *  one on a keyboard. */
function compared(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9']/g, '')
    .replace(/^'+|'+$/g, '')
}

export function tokens(text: string): Token[] {
  return captionWords(text)
    .map((raw) => ({ raw, word: compared(raw) }))
    .filter((t) => t.word !== '')
}

/** Lines up what was typed against what was said. */
export function align(typed: string, expected: string): Mark[] {
  const a = tokens(expected)
  const b = tokens(typed)
  // lcs[i][j]: the longest common run of a[i:] and b[j:].
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i].word === b[j].word ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const marks: Mark[] = []
  let gapA: Token[] = []
  let gapB: Token[] = []
  // What lies between two matches is paired off in order: the first word said
  // with the first word typed, and so on, then whatever is left on either side.
  const flush = () => {
    const n = Math.min(gapA.length, gapB.length)
    for (let k = 0; k < n; k++) marks.push({ kind: 'wrong', expected: gapA[k], typed: gapB[k] })
    for (const t of gapA.slice(n)) marks.push({ kind: 'missing', expected: t })
    for (const t of gapB.slice(n)) marks.push({ kind: 'extra', typed: t })
    gapA = []
    gapB = []
  }

  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i].word === b[j].word) {
      flush()
      marks.push({ kind: 'right', expected: a[i], typed: b[j] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      gapA.push(a[i++])
    } else {
      gapB.push(b[j++])
    }
  }
  gapA.push(...a.slice(i))
  gapB.push(...b.slice(j))
  flush()
  return marks
}

/** Words short enough, and said quickly enough, to slip past the ear. */
const SHORT_WORDS = new Set(
  (
    'a an the of to in on at for from by with as and or but so if ' +
    'is are was were be been am do does did has have had will would can could ' +
    'i you he she it we they me him her us them my your his its our their this that ' +
    "i'm it's that's don't"
  ).split(' '),
)

const ENDINGS = ['s', 'es', 'ed', 'd', "'s", "'d", "'ll", "'re", "'ve"]

/** Whether one word is the other with an ending put on: "walks" and "walk". */
function differByEnding(a: string, b: string): boolean {
  const [long, short] = a.length >= b.length ? [a, b] : [b, a]
  if (short === '' || long === short) return false
  if (ENDINGS.some((e) => long === short + e)) return true
  // study / studies / studied
  return short.endsWith('y') && ['ies', 'ied'].some((e) => long === short.slice(0, -1) + e)
}

/** The kind of a mistake when the words alone say it, and null when only the
 *  learner can. */
export function autoKind(mark: Mark): ErrorKind | null {
  if (mark.kind === 'right' || mark.kind === 'extra') return null
  if (mark.kind === 'wrong' && differByEnding(mark.expected.word, mark.typed.word)) return 'missingEnding'
  if (SHORT_WORDS.has(mark.expected.word)) return 'shortWord'
  return null
}

/** Words said, and of those how many were written down right. A word typed
 *  that was never said is shown, but counts against nothing: the score is how
 *  much of the passage was heard. */
export function score(marks: Mark[]): { total: number; right: number } {
  let total = 0
  let right = 0
  for (const m of marks) {
    if (m.kind === 'extra') continue
    total++
    if (m.kind === 'right') right++
  }
  return { total, right }
}

export type ErrorCounts = Record<ErrorKind, number>

export function emptyCounts(): ErrorCounts {
  return { missingEnding: 0, shortWord: 0, unknownWord: 0, sound: 0, linking: 0, other: 0 }
}

/** Mistakes by kind: the learner's tag where there is one, the word's own kind
 *  where it has one, and "other" for the rest. */
export function countErrors(marks: Mark[][], tags: Record<string, ErrorKind>): ErrorCounts {
  const counts = emptyCounts()
  marks.forEach((chunk, c) =>
    chunk.forEach((m, k) => {
      if (m.kind !== 'wrong' && m.kind !== 'missing') return
      counts[tags[markKey(c, k)] ?? autoKind(m) ?? 'other']++
    }),
  )
  return counts
}

export function markKey(chunk: number, mark: number): string {
  return `${chunk}:${mark}`
}
