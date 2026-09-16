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
