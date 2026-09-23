import { describe, expect, it } from 'vitest'
import { heardCount, heardIn } from '../src/lib/words'
import { captionWords } from '../src/lib/text'
import type { CaptionLine, WordCheck } from '../src/data/types'

const caption = (text: string): CaptionLine => ({ text, ipa: '' })

const check = (...words: [string, boolean][]): WordCheck => ({
  line: words.map(([text, heard]) => ({ text, heard })),
  heard: words.filter(([, heard]) => heard).map(([text]) => text),
  accuracy: words.filter(([, heard]) => heard).length / words.length,
})

describe('captionWords', () => {
  it('splits on whitespace', () => {
    expect(captionWords('We were on a break')).toEqual(['We', 'were', 'on', 'a', 'break'])
  })

  it('drops a token with nothing pronounceable in it', () => {
    // The scoring worker drops it too, and the two lists are read side by side.
    expect(captionWords('Well — no.')).toEqual(['Well', 'no.'])
    expect(captionWords('Hello  world')).toEqual(['Hello', 'world'])
  })

  it('keeps a word that only has letters from another script', () => {
    expect(captionWords('Tổng quan nhé')).toEqual(['Tổng', 'quan', 'nhé'])
  })
})

describe('heardIn', () => {
  const words = check(['We', true], ['were', true], ['on', false], ['a', true], ['break', true])

  it('has nothing to say without a check', () => {
    expect(heardIn(undefined, [caption('We were on a break')], 0)).toBeUndefined()
  })

  it('marks the words of a single-caption clip', () => {
    expect(heardIn(words, [caption('We were on a break')], 0)).toEqual([
      true,
      true,
      false,
      true,
      true,
    ])
  })

  it('offsets into the caption being shown', () => {
    // The take covers the whole clip; the screen shows one line of it.
    const captions = [caption('We were'), caption('on a break')]
    expect(heardIn(words, captions, 0)).toEqual([true, true])
    expect(heardIn(words, captions, 1)).toEqual([false, true, true])
  })

  it('marks nothing rather than the wrong word when the two disagree', () => {
    // Telling somebody they dropped a word they said is worse than telling
    // them nothing.
    expect(heardIn(words, [caption('A different line entirely')], 0)).toBeUndefined()
  })
})

describe('heardCount', () => {
  it('counts what came back', () => {
    expect(heardCount(check(['a', true], ['b', false], ['c', true]))).toEqual({
      heard: 2,
      total: 3,
    })
  })
})
