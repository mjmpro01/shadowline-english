
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

export interface PitchChart {
  refPoints: string
  bandPath: string
  segments: { x1: string; y1: string; x2: string; y2: string; color: string }[]
  gridLines: { y: string; label: string }[]
  xLabels: string[]
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


export function scoreLabel(score: number): string {
  return score >= 75 ? 'Great shadowing' : score >= 50 ? 'Getting there — try again' : 'Needs another take'
}

/** Which band a score lands in.
 *
 * Four bands rather than a gradient, and they line up with the wording
 * `scoreLabel` already uses. A gradient makes 61 and 64 look like different
 * results when they are the same result twice; a band makes crossing into the
 * next one mean something, which is the only reason to show a tier at all. */
export type Tier = 'bronze' | 'silver' | 'gold'

export function tierOf(score: number): Tier {
  return score >= 75 ? 'gold' : score >= 50 ? 'silver' : 'bronze'
}

/** What the next band costs, so a learner knows what they are re-recording for.
 *  Null at the top: there is nothing above gold to reach for. */
export function pointsToNextTier(score: number): number | null {
  if (score >= 75) return null
  return (score >= 50 ? 75 : 50) - score
}

/** Tints for a clip that has no still of its own.
 *
 * Six rather than a full spectrum, all dark enough for the app's cream text to
 * sit on them, all within the palette's own world. A generated hue would give
 * a library of cards that clash with each other and with the amber the rest of
 * the app is built from.
 */
const TILE_TINTS = ['#3b3326', '#2f3a2d', '#3d2f2b', '#2a323a', '#372e39', '#26363a']

/** Which tint a clip gets. Deterministic, so a clip looks the same every time
 *  it is loaded and different from the one beside it — which is the whole job:
 *  a grid where every card is the same grey rectangle cannot be scanned. */
export function tintOf(id: string): string {
  return TILE_TINTS[hashStr(id) % TILE_TINTS.length]
}
