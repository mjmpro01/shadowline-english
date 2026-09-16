
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
