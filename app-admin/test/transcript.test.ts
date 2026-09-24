import { describe, expect, it } from 'vitest'
import { ipaOf, lineOf, wordsBetween } from '../src/lib/transcript'
import type { TranscriptWord } from '../src/data/types'

const word = (start: number, end: number, text: string, ipa = ''): TranscriptWord => ({
  start,
  end,
  text,
  ipa,
})

const SPOKEN = [
  word(0.1, 0.45, 'One', 'ˈwʌn'),
  word(0.5, 0.9, 'step', 'ˈstɛp'),
  word(1.0, 1.2, 'at', 'ˈæt'),
  word(1.25, 1.35, 'a', 'ə'),
  word(1.4, 1.9, 'time.', 'ˈtaɪm'),
  word(3.1, 3.6, 'It', 'ˈɪt'),
  word(3.65, 4.1, 'was', 'ˈwɑz'),
]

// The same rule as words_between in scoring/shadowline/transcribe.py. The two
// have to agree: the worker maps words to clips once, and the studio maps them
// again every time the admin moves a boundary.
describe('wordsBetween', () => {
  it('takes the words inside the boundaries', () => {
    expect(lineOf(wordsBetween(SPOKEN, 0, 2))).toBe('One step at a time.')
    expect(lineOf(wordsBetween(SPOKEN, 3, 4.5))).toBe('It was')
  })

  it('gives a word straddling a cut to the side holding most of it', () => {
    // "step" runs 0.50–0.90, so its middle is 0.70 and a cut at 0.80 leaves
    // most of the word behind it.
    expect(lineOf(wordsBetween(SPOKEN, 0, 0.8))).toBe('One step')
    expect(lineOf(wordsBetween(SPOKEN, 0.8, 1.38))).toBe('at a')
  })

  it('never puts one word in two clips', () => {
    const first = wordsBetween(SPOKEN, 0, 2)
    const second = wordsBetween(SPOKEN, 2, 5)
    const overlap = first.filter((w) => second.includes(w))
    expect(overlap).toEqual([])
    expect(first.length + second.length).toBe(SPOKEN.length)
  })

  it('treats the end as exclusive, so a middle on the boundary goes after it', () => {
    // "a" runs 1.25–1.35, so its middle is exactly 1.30.
    expect(lineOf(wordsBetween(SPOKEN, 0.95, 1.3))).toBe('at')
    expect(lineOf(wordsBetween(SPOKEN, 1.3, 2))).toBe('a time.')
  })

  it('gives a silent stretch an empty line', () => {
    expect(wordsBetween(SPOKEN, 2, 3)).toEqual([])
    expect(lineOf([])).toBe('')
  })
})

describe('ipaOf', () => {
  it('wraps the line in one pair of slashes', () => {
    expect(ipaOf(wordsBetween(SPOKEN, 0, 2))).toBe('/ˈwʌn ˈstɛp ˈæt ə ˈtaɪm/')
  })

  it('drops a word with no pronunciation rather than falling back to spelling', () => {
    const words = [word(0, 1, 'hello', 'həˈloʊ'), word(1, 2, 'zzzqqx')]
    expect(ipaOf(words)).toBe('/həˈloʊ/')
  })

  it('is empty when nothing in the line has a pronunciation', () => {
    expect(ipaOf([word(0, 1, 'zzzqqx')])).toBe('')
    expect(ipaOf([])).toBe('')
  })
})
