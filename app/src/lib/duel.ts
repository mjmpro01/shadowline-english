/**
 * The pure parts of a duel on screen: the clock, and putting scrambled letters
 * back in order. No React, so they are tested on their own.
 */

/** How much of the time is left, 1 → 0. */
export function timeShare(issuedAt: number, deadline: number, now: number): number {
  const total = deadline - issuedAt
  if (total <= 0) return 0
  return Math.min(1, Math.max(0, (deadline - now) / total))
}

/** The letters picked so far, as indexes into the shuffled ones. */
export type Picks = number[]

/** Picks the tile at index i, if it is not picked already. */
export function pickTile(picks: Picks, i: number): Picks {
  return picks.includes(i) ? picks : [...picks, i]
}

/** Picks the first unpicked tile showing this letter (typing on a keyboard). */
export function pickLetter(letters: string[], picks: Picks, letter: string): Picks {
  const want = letter.toLowerCase()
  const i = letters.findIndex((l, idx) => l === want && !picks.includes(idx))
  return i < 0 ? picks : [...picks, i]
}

/** The word spelled by the picks. */
export function spelled(letters: string[], picks: Picks): string {
  return picks.map((i) => letters[i]).join('')
}

/** A number key 1–4 as an option index, or -1. */
export function optionKey(key: string, options: number): number {
  const n = Number(key)
  return Number.isInteger(n) && n >= 1 && n <= options ? n - 1 : -1
}

/** A share of a bar, as a whole percent between 0 and 100. */
export function percent(value: number, max: number): number {
  if (max <= 0) return 0
  return Math.round(Math.min(1, Math.max(0, value / max)) * 100)
}
