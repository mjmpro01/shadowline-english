import { describe, expect, it } from 'vitest'
import { optionKey, percent, pickLetter, pickTile, spelled, timeShare } from '../src/lib/duel'

describe('a duel on screen', () => {
  it('counts the time down from the whole to nothing', () => {
    expect(timeShare(0, 10_000, 0)).toBe(1)
    expect(timeShare(0, 10_000, 2_500)).toBe(0.75)
    expect(timeShare(0, 10_000, 12_000)).toBe(0)
    expect(timeShare(5, 5, 5)).toBe(0)
  })

  it('puts letters back in order, tapped or typed', () => {
    const letters = ['t', 'a', 'c', 'a']
    let picks = pickTile([], 2)
    picks = pickLetter(letters, picks, 'A')
    picks = pickLetter(letters, picks, 'a')
    picks = pickTile(picks, 2)
    picks = pickLetter(letters, picks, 't')
    expect(spelled(letters, picks)).toBe('caat')
    expect(pickLetter(letters, picks, 'z')).toBe(picks)
  })

  it('reads 1–4 as a choice and nothing else', () => {
    expect(optionKey('1', 4)).toBe(0)
    expect(optionKey('4', 4)).toBe(3)
    expect(optionKey('5', 4)).toBe(-1)
    expect(optionKey('a', 4)).toBe(-1)
  })

  it('fills a bar by its share', () => {
    expect(percent(19, 38)).toBe(50)
    expect(percent(-3, 38)).toBe(0)
    expect(percent(50, 38)).toBe(100)
    expect(percent(1, 0)).toBe(0)
  })
})
