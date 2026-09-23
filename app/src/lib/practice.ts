import { METRIC_NAMES, type MetricName, type Take } from '../data/types'

export interface PracticeSuggestion {
  /** The clip. Its name is not here: this is worked out from takes alone, and
   *  the screen fetches the three clips it ends up naming. The app does not
   *  hold the library any more. */
  videoId: string
  /** The measurements behind the suggestion, for the screen to word. */
  detail: { score: number; metric?: MetricName; value?: number }
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
export function needsPractice(takes: Take[], limit = 3): PracticeSuggestion[] {
  const best = new Map<string, Take>()
  for (const take of takes) {
    if (take.score === null) continue
    const current = best.get(take.videoId)
    if (!current || take.score > (current.score ?? 0)) best.set(take.videoId, take)
  }

  return [...best.values()]
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .slice(0, limit)
    .map((take) => {
      const weakest = weakestMetric(take)
      // Only scored takes reach here — the loop above skips the rest — but the
      // Map loses that for the compiler, and the same `?? 0` is already what
      // the sort above uses.
      const score = take.score ?? 0
      return {
        videoId: take.videoId,
        // The sentence is built where the language is known. This carries the
        // parts, not the words: a suggestion assembled here would be English
        // wherever it was shown.
        detail: weakest ? { score, metric: weakest.name, value: weakest.value } : { score },
      }
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
