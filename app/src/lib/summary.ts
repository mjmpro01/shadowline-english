import { METRIC_NAMES, type MetricScores } from '../data/types'

/**
 * A summary built from what was actually measured. The clips ship with an
 * authored summary for their sample history; once a take has real numbers,
 * those numbers should be what the learner reads.
 */
export function summariseTake(scores: MetricScores, meanDeviation: number | null): string {
  const ranked = [...METRIC_NAMES].sort((a, b) => scores[a] - scores[b])
  const weakest = ranked[0]
  const strongest = ranked[ranked.length - 1]

  const distance =
    meanDeviation === null
      ? ''
      : `Your pitch sat ${meanDeviation.toFixed(1)} semitone${meanDeviation === 1 ? '' : 's'} from the source on average. `

  if (scores[strongest] - scores[weakest] < 8) {
    return `${distance}All four measures landed close together, around ${scores[strongest]} — work on the whole line rather than one part of it.`
  }

  return `${distance}${strongest} was your strongest at ${scores[strongest]}; ${weakest.toLowerCase()} is the one to work on, at ${scores[weakest]}.`
}
