import type { Take } from '../data/types'

export interface LearnerStats {
  takes: number
  scoredTakes: number
  averageScore: number | null
  /** Consecutive days practised, counting back from today. */
  streak: number
}

export interface LeaderboardRow {
  id: string
  name: string
  averageScore: number
  streak: number
  isYou: boolean
  /** Sample rows stand in for other learners until there is a backend. */
  isSample: boolean
  rank: number
}

function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

function addDays(key: string, delta: number): string {
  const date = new Date(`${key}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

/**
 * A streak is days practised in a row up to today. Practising yesterday but not
 * yet today still counts — the day is not over — but an older gap ends it.
 */
export function practiceStreak(takes: Take[], today = new Date().toISOString().slice(0, 10)): number {
  const days = new Set(takes.map((take) => dayKey(take.recordedAt)))
  if (!days.size) return 0

  let cursor = days.has(today) ? today : addDays(today, -1)
  if (!days.has(cursor)) return 0

  let streak = 0
  while (days.has(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

export function statsFor(takes: Take[], today?: string): LearnerStats {
  const scored = takes.filter((take) => take.score !== null)
  const total = scored.reduce((sum, take) => sum + (take.score ?? 0), 0)
  return {
    takes: takes.length,
    scoredTakes: scored.length,
    averageScore: scored.length ? Math.round(total / scored.length) : null,
    streak: practiceStreak(takes, today),
  }
}

/**
 * Your row is real; everyone else is sample data. An unscored learner has no
 * average to rank on, so they sit at the bottom rather than at zero.
 */
export function buildLeaderboard(
  peers: { id: string; name: string; averageScore: number; streak: number }[],
  you: { name: string; stats: LearnerStats },
): LeaderboardRow[] {
  const rows = [
    ...peers.map((peer) => ({ ...peer, isYou: false, isSample: true })),
    {
      id: 'you',
      name: you.name,
      averageScore: you.stats.averageScore ?? -1,
      streak: you.stats.streak,
      isYou: true,
      isSample: false,
    },
  ]

  return rows
    .sort((a, b) => b.averageScore - a.averageScore || b.streak - a.streak)
    .map((row, index) => ({ ...row, rank: index + 1 }))
}
