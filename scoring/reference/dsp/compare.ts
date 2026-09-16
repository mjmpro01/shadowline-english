import { semitoneTrack, type Contour } from './pitch'

export type MetricName = 'Intonation' | 'Rhythm' | 'Stress' | 'Variation'
export type MetricScores = Record<MetricName, number>

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

/** Frames of local drift the band allows — 3 seconds at a 10ms hop. */
const MAX_BAND = 300

/**
 * Dynamic time warping over the two semitone tracks, constrained to a
 * Sakoe-Chiba band so an alignment can stretch timing without reordering
 * the sentence.
 *
 * The band is centred on the diagonal between the two lengths, so an overall
 * difference in tempo is already accounted for and the width only has to cover
 * local drift. Capping it keeps a long clip from costing O(n^2).
 */
function dtw(a: number[], b: number[], bandRatio = 0.35): { path: [number, number][]; cost: number } {
  const n = a.length
  const m = b.length
  const band = Math.min(MAX_BAND, Math.max(8, Math.round(Math.max(n, m) * bandRatio)))

  // Only the band is stored. A full n*m matrix reaches hundreds of megabytes on
  // a minute-long clip, nearly all of it cells the band never visits.
  const lo = new Int32Array(n + 1)
  const hi = new Int32Array(n + 1)
  for (let i = 1; i <= n; i++) {
    const centre = Math.round(((i - 1) * m) / n) + 1
    lo[i] = Math.max(1, centre - band)
    hi[i] = Math.min(m, centre + band)
  }
  const width = 2 * band + 2
  const cost = new Float64Array((n + 1) * width).fill(Infinity)
  const get = (i: number, j: number) =>
    i < 0 || j < lo[i] || j > hi[i] ? Infinity : cost[i * width + (j - lo[i])]
  cost[0] = 0

  for (let i = 1; i <= n; i++) {
    for (let j = lo[i]; j <= hi[i]; j++) {
      const local = Math.abs(a[i - 1] - b[j - 1])
      cost[i * width + (j - lo[i])] = local + Math.min(get(i - 1, j), get(i, j - 1), get(i - 1, j - 1))
    }
  }

  const path: [number, number][] = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    path.push([i - 1, j - 1])
    const diag = get(i - 1, j - 1)
    const up = get(i - 1, j)
    const left = get(i, j - 1)
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
  return { path, cost: get(n, m) }
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
