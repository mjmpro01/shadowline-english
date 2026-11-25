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

/** How hard a right answer hits for the share of the time it left, 0–100:
 *  the server's 1.6 at once down to 0.6 at the buzzer, to one decimal. */
export function swing(speed: number): number {
  const used = 1 - Math.min(100, Math.max(0, speed)) / 100
  return Math.round((1.6 - used) * 10) / 10
}

/** Days of practice to earn `short` coins at a learner's rate, counting at
 *  least the daily goal's 20 a day; 0 when nothing is short. */
export function daysToEarn(short: number, perDay: number): number {
  if (short <= 0) return 0
  return Math.ceil(short / Math.max(20, perDay))
}
