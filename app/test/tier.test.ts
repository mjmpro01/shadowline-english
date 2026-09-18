import { describe, expect, it } from 'vitest'
import { pointsToNextTier, scoreLabelKey, tierOf } from '../src/lib/score'

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
    // "getting there" in the same breath, in the same card. Both are keys now,
    // so this holds in every language at once.
    expect(tierOf(75)).toBe('gold')
    expect(scoreLabelKey(75)).toBe('score.great')
    expect(tierOf(74)).toBe('silver')
    expect(scoreLabelKey(74)).toBe('score.getting')
    expect(tierOf(49)).toBe('bronze')
    expect(scoreLabelKey(49)).toBe('score.needs')
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
