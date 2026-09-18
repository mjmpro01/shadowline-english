import { describe, expect, it } from 'vitest'
import { pointsToNextTier, scoreLabel, tierOf } from '../src/lib/score'

describe('score tiers', () => {
  it('names the band a score lands in', () => {
    expect(tierOf(0)).toBe('bronze')
    expect(tierOf(49)).toBe('bronze')
    expect(tierOf(50)).toBe('silver')
    expect(tierOf(74)).toBe('silver')
    expect(tierOf(75)).toBe('gold')
    expect(tierOf(100)).toBe('gold')
  })

  it('switches where the wording switches', () => {
    // Two ladders that disagree would tell a learner they had reached gold and
    // "getting there" in the same breath, in the same card.
    expect(tierOf(75)).toBe('gold')
    expect(scoreLabel(75)).toBe('Great shadowing')
    expect(tierOf(74)).toBe('silver')
    expect(scoreLabel(74)).toBe('Getting there — try again')
    expect(tierOf(49)).toBe('bronze')
    expect(scoreLabel(49)).toBe('Needs another take')
  })

  it('says what the next band costs', () => {
    expect(pointsToNextTier(42)).toBe(8)
    expect(pointsToNextTier(50)).toBe(25)
    expect(pointsToNextTier(74)).toBe(1)
  })

  it('has nothing to promise above the top band', () => {
    expect(pointsToNextTier(75)).toBeNull()
    expect(pointsToNextTier(100)).toBeNull()
  })
})
