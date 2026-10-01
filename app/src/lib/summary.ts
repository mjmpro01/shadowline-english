import { METRIC_NAMES, type MetricScores } from '../data/types'
import type { Translate } from '../i18n'

/**
 * A summary built from what was actually measured. The clips ship with an
 * authored summary for their sample history; once a take has real numbers,
 * those numbers should be what the learner reads — in the learner's language.
 */
export function summariseTake(scores: MetricScores, meanDeviation: number | null, t: Translate): string {
  const ranked = [...METRIC_NAMES].sort((a, b) => scores[a] - scores[b])
  const weakest = ranked[0]
  const strongest = ranked[ranked.length - 1]

  const distance = meanDeviation === null ? '' : t('analysis.distance', meanDeviation)

  if (scores[strongest] - scores[weakest] < 8) {
    return distance + t('analysis.allClose', scores[strongest])
  }

  return (
    distance +
    t(
      'analysis.strongestWeakest',
      t(`metric.${strongest}`),
      scores[strongest],
      t(`metric.${weakest}`),
      scores[weakest],
    )
  )
}
