import { describe, expect, it } from 'vitest'
import { practiceStreak, statsFor } from '../src/lib/leaderboard'
import type { Take } from '../src/data/types'

const take = (day: string, score: number | null = 80): Take => ({
  id: `${day}-${score}`,
  videoId: 'v1',
  score,
  scores: null,
  analysis: null,
  status: score === null ? 'failed' : 'scored',
  recordedAt: `${day}T09:00:00.000Z`,
  hasAudio: true,
})

describe('practiceStreak', () => {
  it('counts days practised in a row up to today', () => {
    const takes = [take('2026-09-14'), take('2026-09-15'), take('2026-09-16')]
    expect(practiceStreak(takes, '2026-09-16')).toBe(3)
  })

  it('still counts when today has not been practised yet', () => {
    expect(practiceStreak([take('2026-09-14'), take('2026-09-15')], '2026-09-16')).toBe(2)
  })

  it('ends at a gap', () => {
    const takes = [take('2026-09-10'), take('2026-09-11'), take('2026-09-15'), take('2026-09-16')]
    expect(practiceStreak(takes, '2026-09-16')).toBe(2)
  })

  it('is zero once two days have been missed', () => {
    expect(practiceStreak([take('2026-09-13')], '2026-09-16')).toBe(0)
  })

  it('counts several takes on one day once', () => {
    expect(practiceStreak([take('2026-09-16', 70), take('2026-09-16', 90)], '2026-09-16')).toBe(1)
  })

  it('is zero with no takes at all', () => {
    expect(practiceStreak([], '2026-09-16')).toBe(0)
  })
})

describe('statsFor', () => {
  it('averages only the takes that were scored', () => {
    const stats = statsFor([take('2026-09-16', 80), take('2026-09-16', 90), take('2026-09-16', null)], '2026-09-16')
    expect(stats.takes).toBe(3)
    expect(stats.scoredTakes).toBe(2)
    expect(stats.averageScore).toBe(85)
  })

  it('has no average when nothing has been scored', () => {
    expect(statsFor([take('2026-09-16', null)], '2026-09-16').averageScore).toBeNull()
  })
})

