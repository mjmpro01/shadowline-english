/**
 * Geometry for the Practice guide strip: purple source waveform to follow,
 * cyan live take while recording, red playhead.
 *
 * Amplitude only — a pitch polyline on top of the same purple fill looked like
 * a second unrelated squiggle and made the strip hard to read.
 */

const W = 640
const H = 140
const PAD_L = 8
const PAD_R = 8
const PAD_T = 10
const PAD_B = 10

const plotW = W - PAD_L - PAD_R
const plotH = H - PAD_T - PAD_B
const midY = PAD_T + plotH / 2

export const GUIDE_VIEW = { W, H, PAD_L, PAD_R, PAD_T, PAD_B, plotW, plotH, midY }

export const SOURCE_PURPLE = '#8b5cf6'
export const SOURCE_PURPLE_FILL = 'rgba(139, 92, 246, 0.45)'
export const YOU_CYAN = '#22d3ee'
export const YOU_CYAN_FILL = 'rgba(34, 211, 238, 0.38)'
export const PLAYHEAD_RED = '#f87171'

export function guideX(t: number, duration: number): number {
  const span = duration > 0 ? duration : 1
  const clamped = Math.max(0, Math.min(t, span))
  return PAD_L + (clamped / span) * plotW
}

/**
 * Mirrored amplitude envelope as an SVG path.
 *
 * `levels` are evenly spaced across `[0, timeSpan]` — the full clip for the
 * source, or elapsed seconds for the live take. Passing the clip duration as
 * timeSpan for a short live buffer used to stretch a few samples across the
 * whole strip and looked broken.
 */
export function envelopePath(levels: number[], clipDuration: number, timeSpan = clipDuration): string {
  if (levels.length < 2 || clipDuration <= 0 || timeSpan <= 0) return ''

  const top: string[] = []
  const bottom: string[] = []
  const last = levels.length - 1
  for (let i = 0; i <= last; i++) {
    const t = (i / last) * timeSpan
    const x = guideX(t, clipDuration).toFixed(1)
    const amp = Math.min(1, levels[i] ?? 0) * (plotH / 2) * 0.88
    top.push(`${x},${(midY - amp).toFixed(1)}`)
    bottom.push(`${x},${(midY + amp).toFixed(1)}`)
  }
  return `M${top.join(' L')} L${bottom.reverse().join(' L')} Z`
}
