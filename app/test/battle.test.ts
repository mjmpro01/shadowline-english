import { describe, expect, it } from 'vitest'
import { optionKey, pickLetter, pickTile, spelled, timeLeft, timeShare } from '../src/game/battle'

describe('the fight clock', () => {
  const issued = '2026-10-20T10:00:00.000Z'
  const deadline = '2026-10-20T10:00:10.000Z'
  const at = (s: number) => Date.parse(issued) + s * 1000

  it('counts down by the server clock and stops at zero', () => {
    expect(timeLeft(deadline, at(0))).toBe(10)
    expect(timeLeft(deadline, at(7.5))).toBe(2.5)
    expect(timeLeft(deadline, at(12))).toBe(0)
  })

  it('says how much of the time is left', () => {
    expect(timeShare(issued, deadline, at(0))).toBe(1)
    expect(timeShare(issued, deadline, at(5))).toBe(0.5)
    expect(timeShare(issued, deadline, at(20))).toBe(0)
    expect(timeShare(issued, deadline, at(-3))).toBe(1)
    expect(timeShare(deadline, deadline, at(0))).toBe(0)
  })
})

describe('putting a scramble back in order', () => {
  const letters = ['l', 'e', 'p', 'p', 'a']

  it('picks each tile once', () => {
    expect(pickTile([2], 2)).toEqual([2])
    expect(pickTile([2], 0)).toEqual([2, 0])
  })

  it('types a letter onto the first tile showing it that is still free', () => {
    let picks = pickLetter(letters, [], 'A')
    expect(picks).toEqual([4])
    picks = pickLetter(letters, picks, 'p')
    picks = pickLetter(letters, picks, 'p')
    expect(picks).toEqual([4, 2, 3])
    // No third p to pick.
    expect(pickLetter(letters, picks, 'p')).toEqual(picks)
    expect(pickLetter(letters, picks, 'z')).toEqual(picks)
  })

  it('spells the picks', () => {
    expect(spelled(letters, [4, 2, 3, 0, 1])).toBe('apple')
    expect(spelled(letters, [])).toBe('')
  })
})

describe('number keys', () => {
  it('choose options 1 to n', () => {
    expect(optionKey('1', 4)).toBe(0)
    expect(optionKey('4', 4)).toBe(3)
    expect(optionKey('5', 4)).toBe(-1)
    expect(optionKey('0', 4)).toBe(-1)
    expect(optionKey('a', 4)).toBe(-1)
    expect(optionKey(' ', 4)).toBe(-1)
  })
})
