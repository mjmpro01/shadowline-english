import type { ContourPoint, TakeAnalysis } from '../../data/types'
import { ATTENTION, GOOD, MEDIUM, type PitchChart } from '../score'

const W = 640
const H = 200
const PAD_L = 30
const PAD_R = 10
const PAD_T = 10
const PAD_B = 24
const SPAN = 6

const plotW = W - PAD_L - PAD_R
const plotH = H - PAD_T - PAD_B

const mapY = (semitone: number) =>
  PAD_T + ((SPAN - Math.max(-SPAN, Math.min(SPAN, semitone))) / (SPAN * 2)) * plotH

const GRID = [-6, -3, 0, 3, 6].map((s) => ({ y: mapY(s).toFixed(1), label: (s > 0 ? '+' : '') + s }))

/** Each track is drawn against its own span so both fill the same width. */
function mapXFactory(track: ContourPoint[]) {
  const first = track[0]?.t ?? 0
  const span = (track[track.length - 1]?.t ?? 1) - first || 1
  return (point: ContourPoint) => PAD_L + ((point.t - first) / span) * plotW
}

function timeLabels(duration: number): string[] {
  return [0, 0.25, 0.5, 0.75].map((fraction) => {
    const seconds = duration * fraction
    // Whole seconds collapse into duplicates on a short take.
    if (duration < 10) return `${seconds.toFixed(1)}s`
    const minutes = Math.floor(seconds / 60)
    return `${minutes}:${Math.round(seconds % 60).toString().padStart(2, '0')}`
  })
}

/** Renders a measured contour, with the reference band when one was used. */
export function chartFromAnalysis(analysis: TakeAnalysis): PitchChart {
  const userX = mapXFactory(analysis.user)

  let refPoints = ''
  let bandPath = ''
  if (analysis.reference?.length) {
    const refX = mapXFactory(analysis.reference)
    refPoints = analysis.reference.map((p) => `${refX(p).toFixed(1)},${mapY(p.s).toFixed(1)}`).join(' ')
    const upper = analysis.reference.map((p) => `${refX(p).toFixed(1)},${mapY(p.s + 1).toFixed(1)}`)
    const lower = analysis.reference.map((p) => `${refX(p).toFixed(1)},${mapY(p.s - 1).toFixed(1)}`).reverse()
    bandPath = `M${upper.join(' L')} L${lower.join(' L')} Z`
  }

  const segments = []
  for (let i = 0; i < analysis.user.length - 1; i++) {
    const a = analysis.user[i]
    const b = analysis.user[i + 1]
    // A gap in voicing is a pause, not a slide between two pitches.
    if (b.t - a.t > 0.25) continue
    const dev = a.d === undefined || b.d === undefined ? null : (a.d + b.d) / 2
    segments.push({
      x1: userX(a).toFixed(1),
      y1: mapY(a.s).toFixed(1),
      x2: userX(b).toFixed(1),
      y2: mapY(b.s).toFixed(1),
      color: dev === null ? GOOD : dev <= 1 ? GOOD : dev <= 2 ? MEDIUM : ATTENTION,
    })
  }

  return { refPoints, bandPath, segments, gridLines: GRID, xLabels: timeLabels(analysis.duration) }
}
