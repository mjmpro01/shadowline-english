import { METRIC_NAMES, type MetricScores } from '../data/types'

export const GOOD = 'var(--score-good)'
export const MEDIUM = 'var(--score-medium)'
export const ATTENTION = 'var(--score-attention)'

export function colorFor(score: number): string {
  return score >= 75 ? GOOD : score >= 50 ? MEDIUM : ATTENTION
}

export function hashStr(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h += str.charCodeAt(i) * (i + 7)
  return h
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

/**
 * Synthetic pitch contours. Real F0 extraction is a later phase — this keeps
 * the curve deterministic per clip so the chart never jitters between renders.
 */
function genPitch(seed: number, score: number, n: number) {
  const ref: number[] = []
  const user: number[] = []
  const amp = (1 - score / 100) * 3 + 0.4
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const r = Math.sin(t * Math.PI * 2.3 + seed) * 2.6 + Math.sin(t * Math.PI * 5.2 + seed * 1.7) * 0.7
    ref.push(r)
    user.push(r + Math.sin(i * 0.9 + seed * 3) * amp)
  }
  return { ref, user }
}

export interface PitchChart {
  refPoints: string
  bandPath: string
  segments: { x1: string; y1: string; x2: string; y2: string; color: string }[]
  gridLines: { y: string; label: string }[]
  xLabels: string[]
}

export function buildChart(seedKey: string, score: number): PitchChart {
  const n = 28
  const W = 640
  const H = 200
  const padL = 30
  const padR = 10
  const padT = 10
  const padB = 24
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const seed = hashStr(seedKey) % 10
  const { ref, user } = genPitch(seed, score, n)
  const mapX = (i: number) => padL + (i / (n - 1)) * plotW
  const mapY = (v: number) => padT + ((6 - clamp(v, -6, 6)) / 12) * plotH

  const refPoints = ref.map((v, i) => `${mapX(i)},${mapY(v).toFixed(1)}`).join(' ')

  let upper = 'M'
  const lower: string[] = []
  ref.forEach((v, i) => {
    const x = mapX(i)
    upper += `${i === 0 ? '' : 'L'}${x},${mapY(v + 1).toFixed(1)} `
    lower.unshift(`${x},${mapY(v - 1).toFixed(1)}`)
  })
  const bandPath = `${upper}L${lower.join(' L')} Z`

  const segments = []
  for (let i = 0; i < n - 1; i++) {
    const dev = (Math.abs(user[i] - ref[i]) + Math.abs(user[i + 1] - ref[i + 1])) / 2
    segments.push({
      x1: mapX(i).toFixed(1),
      y1: mapY(user[i]).toFixed(1),
      x2: mapX(i + 1).toFixed(1),
      y2: mapY(user[i + 1]).toFixed(1),
      color: dev <= 1 ? GOOD : dev <= 2 ? MEDIUM : ATTENTION,
    })
  }

  const gridLines = [-6, -3, 0, 3, 6].map((s) => ({
    y: mapY(s).toFixed(1),
    label: (s > 0 ? '+' : '') + s,
  }))

  return { refPoints, bandPath, segments, gridLines, xLabels: ['0:00', '0:10', '0:20', '0:30'] }
}

export function sparkPoints(scores: number[]): string {
  const w = 56
  const h = 20
  const pad = 2
  return scores
    .map((s, i) => {
      const x = pad + (i / (scores.length - 1 || 1)) * (w - pad * 2)
      const y = h - pad - (s / 100) * (h - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

/** Per-word underline colours on the transcript, seeded off the word itself. */
export function wordScore(word: string, takeScore: number): number {
  const clean = word.replace(/[^a-zA-Z']/g, '')
  return clamp(takeScore + (hashStr(clean) % 40) - 20, 8, 99)
}

/**
 * Metric breakdown for a take. The newest take keeps the clip's authored
 * profile; older ones are scaled toward their own score so the take selector
 * shows real movement.
 */
export function metricsForTake(profile: MetricScores, takeScore: number, latestScore: number): MetricScores {
  if (takeScore === latestScore) return { ...profile }
  const delta = takeScore - latestScore
  const out = {} as MetricScores
  for (const name of METRIC_NAMES) {
    const jitter = (hashStr(name + takeScore) % 7) - 3
    out[name] = clamp(Math.round(profile[name] + delta + jitter), 5, 99)
  }
  return out
}

export function scoreLabel(score: number): string {
  return score >= 75 ? 'Great shadowing' : score >= 50 ? 'Getting there — try again' : 'Needs another take'
}
