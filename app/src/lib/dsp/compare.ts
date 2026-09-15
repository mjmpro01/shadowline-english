import type { MetricScores } from '../../data/types'
import { semitoneTrack, type Contour } from './pitch'

export interface TrackPoint {
  time: number
  semitone: number
  rms: number
}

export interface Comparison {
  score: number
  scores: MetricScores
  /** Mean absolute pitch distance after alignment, in semitones. */
  meanDeviation: number
  reference: TrackPoint[]
  user: TrackPoint[]
  /** Aligned index pairs, used to colour the user's line by local deviation. */
  path: [number, number][]
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

/** 10th–90th percentile spread: how much the voice actually moves, ignoring outliers. */
export function pitchRange(track: TrackPoint[]): number {
  const sorted = track.map((p) => p.semitone).sort((a, b) => a - b)
  return percentile(sorted, 0.9) - percentile(sorted, 0.1)
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

/**
 * Both contours on a shared 0..1 time axis.
 *
 * Intonation is judged here rather than on the warped alignment: time warping
 * lets a monotone delivery hide, because every flat frame can be matched to
 * whichever reference frame happens to sit at the same pitch.
 */
function resample(track: TrackPoint[], count: number): number[] {
  const first = track[0].time
  const span = track[track.length - 1].time - first || 1
  const out: number[] = []
  let cursor = 0
  for (let i = 0; i < count; i++) {
    const target = first + (i / (count - 1)) * span
    while (cursor < track.length - 2 && track[cursor + 1].time < target) cursor++
    const a = track[cursor]
    const b = track[cursor + 1] ?? a
    const gap = b.time - a.time
    const ratio = gap <= 0 ? 0 : (target - a.time) / gap
    out.push(a.semitone + (b.semitone - a.semitone) * Math.max(0, Math.min(1, ratio)))
  }
  return out
}

/**
 * Dynamic time warping over the two semitone tracks, constrained to a
 * Sakoe-Chiba band so an alignment can stretch timing without reordering
 * the sentence.
 */
function dtw(a: number[], b: number[], bandRatio = 0.35): { path: [number, number][]; cost: number } {
  const n = a.length
  const m = b.length
  const band = Math.max(8, Math.round(Math.max(n, m) * bandRatio))
  const cost = new Float64Array((n + 1) * (m + 1)).fill(Infinity)
  const at = (i: number, j: number) => i * (m + 1) + j
  cost[at(0, 0)] = 0

  for (let i = 1; i <= n; i++) {
    const centre = Math.round(((i - 1) * m) / n) + 1
    const from = Math.max(1, centre - band)
    const to = Math.min(m, centre + band)
    for (let j = from; j <= to; j++) {
      const local = Math.abs(a[i - 1] - b[j - 1])
      const best = Math.min(cost[at(i - 1, j)], cost[at(i, j - 1)], cost[at(i - 1, j - 1)])
      cost[at(i, j)] = local + best
    }
  }

  const path: [number, number][] = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    path.push([i - 1, j - 1])
    const diag = cost[at(i - 1, j - 1)]
    const up = cost[at(i - 1, j)]
    const left = cost[at(i, j - 1)]
    if (diag <= up && diag <= left) {
      i--
      j--
    } else if (up <= left) {
      i--
    } else {
      j--
    }
  }
  path.reverse()
  return { path, cost: cost[at(n, m)] }
}

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return 0
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
  }
  const mx = sx / n
  const my = sy / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx
    const b = ys[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  const denom = Math.sqrt(dx * dy)
  return denom === 0 ? 0 : num / denom
}

/**
 * Scores a take against the clip's reference contour.
 *
 * Both tracks are already expressed in semitones around each speaker's own
 * median, so a low voice shadowing a high one is not penalised for register —
 * only for the shape, timing, emphasis and range of the delivery.
 */
export function compareContours(referenceContour: Contour, userContour: Contour): Comparison | null {
  const reference = semitoneTrack(referenceContour)
  const user = semitoneTrack(userContour)
  if (reference.length < 8 || user.length < 8) return null

  const { path } = dtw(
    user.map((p) => p.semitone),
    reference.map((p) => p.semitone),
  )

  let deviationSum = 0
  let diagonalSum = 0
  const userEnergy: number[] = []
  const refEnergy: number[] = []
  for (const [ui, ri] of path) {
    deviationSum += Math.abs(user[ui].semitone - reference[ri].semitone)
    diagonalSum += Math.abs(ui / (user.length - 1) - ri / (reference.length - 1))
    userEnergy.push(user[ui].rms)
    refEnergy.push(reference[ri].rms)
  }
  const meanDeviation = deviationSum / path.length
  const meanDrift = diagonalSum / path.length

  // Shape: the same melody at the same points in the sentence, timing aside.
  const SHAPE_POINTS = 200
  const userShape = resample(user, SHAPE_POINTS)
  const refShape = resample(reference, SHAPE_POINTS)
  let shapeSum = 0
  for (let i = 0; i < SHAPE_POINTS; i++) shapeSum += Math.abs(userShape[i] - refShape[i])
  const shapeDeviation = shapeSum / SHAPE_POINTS

  // A semitone off on average is still good shadowing; 7+ is a different tune.
  const intonation = clampScore(100 - shapeDeviation * 14)

  // Timing: how far the alignment had to wander from the diagonal, plus how
  // closely the two utterances match in length.
  const lengthRatio = Math.min(userContour.duration, referenceContour.duration) /
    Math.max(userContour.duration, referenceContour.duration || 1)
  const rhythm = clampScore((100 - meanDrift * 320) * 0.55 + lengthRatio * 100 * 0.45)

  // Stress: do the loud and quiet moments land in the same places once aligned.
  const stress = clampScore(50 * (1 + pearson(userEnergy, refEnergy)))

  // Variation: is the voice moving as much as the source, not more or less.
  const userRange = pitchRange(user)
  const refRange = pitchRange(reference)
  const rangeRatio = refRange === 0 ? 0 : Math.min(userRange, refRange) / Math.max(userRange, refRange)
  const variation = clampScore(rangeRatio * 100)

  const scores: MetricScores = { Intonation: intonation, Rhythm: rhythm, Stress: stress, Variation: variation }
  const score = clampScore(intonation * 0.4 + rhythm * 0.2 + stress * 0.2 + variation * 0.2)

  return { score, scores, meanDeviation, reference, user, path }
}
