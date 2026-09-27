
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

/** How a score reads, as a message key rather than a sentence: this is a pure
 *  function of the number and knows nothing about who is reading it. */
export function scoreLabelKey(score: number): 'score.great' | 'score.getting' | 'score.needs' {
  return score >= 75 ? 'score.great' : score >= 50 ? 'score.getting' : 'score.needs'
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

/** Faces for a clip that has no still of its own.
 *
 * Six gradients rather than a generated hue: bright enough to make a grid of
 * clips something a child wants to tap, deep enough at the bottom for white
 * type, and all from the forest — honey, moss, lake, berry, dusk and ember —
 * so they sit with the amber and the menu instead of clashing with them. They
 * read the same on the light theme and the dark one.
 */
const TILE_TINTS = [
  'linear-gradient(155deg, #f7c948 0%, #e08a1e 100%)',
  'linear-gradient(155deg, #8fd46b 0%, #3f8f47 100%)',
  'linear-gradient(155deg, #6cc6f0 0%, #2f73c2 100%)',
  'linear-gradient(155deg, #f59aa8 0%, #d2476a 100%)',
  'linear-gradient(155deg, #b69cf5 0%, #6c4fc4 100%)',
  'linear-gradient(155deg, #ffae73 0%, #de5b2b 100%)',
]

/** Which tint a clip gets. Deterministic, so a clip looks the same every time
 *  it is loaded and different from the one beside it — which is the whole job:
 *  a grid where every card is the same grey rectangle cannot be scanned. */
export function tintOf(id: string): string {
  return TILE_TINTS[hashStr(id) % TILE_TINTS.length]
}
