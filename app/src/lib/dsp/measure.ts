import type { ContourPoint, MetricScores, TakeAnalysis } from '../../data/types'
import { compareContours, type TrackPoint } from './compare'
import { semitoneTrack, trackPitch, type Contour } from './pitch'

/** Plenty for the chart, small enough to keep many takes in local storage. */
const STORED_POINTS = 150

function decimate(track: TrackPoint[], deviations?: Map<number, number>): ContourPoint[] {
  const step = Math.max(1, Math.ceil(track.length / STORED_POINTS))
  const out: ContourPoint[] = []
  for (let i = 0; i < track.length; i += step) {
    const point: ContourPoint = {
      t: Number(track[i].time.toFixed(3)),
      s: Number(track[i].semitone.toFixed(2)),
    }
    const deviation = deviations?.get(i)
    if (deviation !== undefined) point.d = Number(deviation.toFixed(2))
    out.push(point)
  }
  return out
}

export interface TakeResult {
  analysis: TakeAnalysis
  /** Null when there was no reference to score against. */
  score: number | null
  scores: MetricScores | null
}

/**
 * The measurement itself, over decoded samples. Kept free of browser APIs so it
 * can run in a worker: on a minute-long clip this is seconds of arithmetic, and
 * on the main thread that is seconds of frozen UI.
 */
export function measureTake(
  takeSamples: Float32Array,
  sampleRate: number,
  referenceContour: Contour | null,
): TakeResult | null {
  const userContour = trackPitch(takeSamples, sampleRate)
  const userTrack = semitoneTrack(userContour)
  if (userTrack.length < 8) return null

  const comparison = referenceContour ? compareContours(referenceContour, userContour) : null

  if (!comparison) {
    return {
      analysis: { user: decimate(userTrack), reference: null, duration: userContour.duration, meanDeviation: null },
      score: null,
      scores: null,
    }
  }

  const deviations = new Map<number, number>()
  for (const [ui, ri] of comparison.path) {
    const value = Math.abs(comparison.user[ui].semitone - comparison.reference[ri].semitone)
    deviations.set(ui, Math.max(deviations.get(ui) ?? 0, value))
  }

  return {
    analysis: {
      user: decimate(comparison.user, deviations),
      reference: decimate(comparison.reference),
      duration: userContour.duration,
      meanDeviation: Number(comparison.meanDeviation.toFixed(2)),
    },
    score: comparison.score,
    scores: comparison.scores,
  }
}

export { trackPitch }
