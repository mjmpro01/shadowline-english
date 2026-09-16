import { describe, expect, it } from 'vitest'
import { buildLeaderboard, practiceStreak, statsFor } from '../src/lib/leaderboard'
import type { Take } from '../src/data/types'

const take = (day: string, score: number | null = 80): Take => ({
  id: `${day}-${score}`,
  videoId: 'v1',
  score,
  scores: null,
  recordedAt: `${day}T09:00:00.000Z`,
  audioKey: null,
  analysis: null,
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

describe('buildLeaderboard', () => {
  const peers = [
    { id: 'a', name: 'Linh', averageScore: 91, streak: 18 },
    { id: 'b', name: 'Minh', averageScore: 70, streak: 9 },
  ]

  it('ranks you among the others by score', () => {
    const rows = buildLeaderboard(peers, { name: 'You', stats: statsFor([take('2026-09-16', 80)], '2026-09-16') })
    expect(rows.map((r) => r.name)).toEqual(['Linh', 'You', 'Minh'])
    expect(rows.find((r) => r.isYou)?.rank).toBe(2)
  })

  it('marks everyone but you as sample data', () => {
    const rows = buildLeaderboard(peers, { name: 'You', stats: statsFor([], '2026-09-16') })
    expect(rows.filter((r) => r.isSample)).toHaveLength(2)
    expect(rows.find((r) => r.isYou)?.isSample).toBe(false)
  })

  it('puts an unscored learner last rather than at zero', () => {
    const rows = buildLeaderboard(peers, { name: 'You', stats: statsFor([], '2026-09-16') })
    expect(rows[rows.length - 1].isYou).toBe(true)
  })

  it('breaks a tie on the longer streak', () => {
    const tied = [{ id: 'a', name: 'Linh', averageScore: 80, streak: 18 }]
    const rows = buildLeaderboard(tied, {
      name: 'You',
      stats: statsFor([take('2026-09-16', 80)], '2026-09-16'),
    })
    expect(rows[0].name).toBe('Linh')
  })
})
