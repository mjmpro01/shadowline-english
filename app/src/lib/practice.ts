import { METRIC_NAMES, type MetricName, type Take, type Video } from '../data/types'

export interface PracticeSuggestion {
  id: string
  title: string
  detail: string
  videoId: string
}

/**
 * The clips worth going back to, taken from what was actually scored.
 *
 * This used to be three hand-written rows pointing at clip ids that a real
 * library would not have. A suggestion the app invented would be worse than no
 * suggestion: it reads as a measurement, and there was nothing behind it.
 *
 * A clip qualifies on its *best* take rather than its latest: if you have
 * already managed 88 on a line, it is not the one to practise next, whatever
 * today's attempt looked like.
 */
export function needsPractice(takes: Take[], videos: Video[], limit = 3): PracticeSuggestion[] {
  const best = new Map<string, Take>()
  for (const take of takes) {
    if (take.score === null) continue
    const current = best.get(take.videoId)
    if (!current || take.score > (current.score ?? 0)) best.set(take.videoId, take)
  }

  return [...best.values()]
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .slice(0, limit)
    .flatMap((take) => {
      const video = videos.find((v) => v.id === take.videoId)
      if (!video) return []
      const weakest = weakestMetric(take)
      return [
        {
          id: take.videoId,
          title: video.title,
          detail: weakest
            ? `Best so far ${take.score} — ${weakest.name.toLowerCase()} is the weakest at ${weakest.value}`
            : `Best so far ${take.score}`,
          videoId: take.videoId,
        },
      ]
    })
}

function weakestMetric(take: Take): { name: MetricName; value: number } | null {
  if (!take.scores) return null
  let weakest: { name: MetricName; value: number } | null = null
  for (const name of METRIC_NAMES) {
    const value = take.scores[name]
    if (weakest === null || value < weakest.value) weakest = { name, value }
  }
  return weakest
}

/**
 * Which of the four a learner is weakest at, across everything they have
 * scored. Null until there is something to average.
 *
 * Averaged over every scored take rather than the last one: one bad recording
 * is a bad recording, not a weakness, and pointing a learner at the wrong
 * thing to work on is worse than pointing them at nothing.
 */
export function weakestOverall(takes: Take[]): MetricName | null {
  const totals = new Map<MetricName, { sum: number; count: number }>()
  for (const take of takes) {
    if (!take.scores) continue
    for (const name of METRIC_NAMES) {
      const soFar = totals.get(name) ?? { sum: 0, count: 0 }
      totals.set(name, { sum: soFar.sum + take.scores[name], count: soFar.count + 1 })
    }
  }
  if (!totals.size) return null

  let weakest: MetricName | null = null
  let lowest = Infinity
  for (const name of METRIC_NAMES) {
    const entry = totals.get(name)
    if (!entry) continue
    const average = entry.sum / entry.count
    if (average < lowest) {
      lowest = average
      weakest = name
    }
  }
  return weakest
}

/**
 * The clip to offer next: one never practised, or failing that the one with
 * the lowest best score. Null when the library is empty.
 *
 * This used to be `videos.find(v => v.id === 'v5')`, a prototype id no real
 * library has, so it always fell through to whichever clip happened to be
 * first — offered under a sentence claiming it had been chosen.
 */
export function nextUp(takes: Take[], videos: Video[]): Video | null {
  if (!videos.length) return null

  const practised = new Set(takes.map((take) => take.videoId))
  const fresh = videos.find((video) => !practised.has(video.id))
  if (fresh) return fresh

  const best = new Map<string, number>()
  for (const take of takes) {
    if (take.score === null) continue
    best.set(take.videoId, Math.max(best.get(take.videoId) ?? 0, take.score))
  }
  return (
    [...videos].sort((a, b) => (best.get(a.id) ?? 0) - (best.get(b.id) ?? 0))[0] ?? videos[0]
  )
}
