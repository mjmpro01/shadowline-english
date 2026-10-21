/**
 * The pure parts of a fight on screen: the clock, and putting scrambled
 * letters back in order. No React, no Phaser, so they are tested on their own.
 */

/** Seconds left to answer, by the server's clock, never below zero. */
export function timeLeft(deadline: string, serverNow: number): number {
  return Math.max(0, (Date.parse(deadline) - serverNow) / 1000)
}

/** How much of the time is left, 1 → 0. */
export function timeShare(issuedAt: string, deadline: string, serverNow: number): number {
  const total = Date.parse(deadline) - Date.parse(issuedAt)
  if (total <= 0) return 0
  return Math.min(1, Math.max(0, (Date.parse(deadline) - serverNow) / total))
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

/** What the monster in the fight panel is doing: breathing, striking the
 *  player, taking a hit, going down. */
export type SpriteMove = 'idle' | 'attack' | 'hurt' | 'down'

/**
 * The frame of a monster's strip to show: its rows are standing, moving or
 * attacking, hit, and going down, `cols` frames each. Standing loops; the rest
 * play once, after which a hit or an attack goes back to standing and going
 * down stays down.
 */
export function spriteFrame(
  move: SpriteMove,
  cols: number,
  rows: { attack: number; hurt: number; down: number },
  elapsedMs: number,
  fps: number,
): number {
  const step = Math.max(0, Math.floor((elapsedMs * fps) / 1000))
  if (move === 'down') return rows.down * cols + Math.min(step, cols - 1)
  if (move !== 'idle' && step < cols) return rows[move] * cols + step
  // Standing, from where the move ended.
  const since = move === 'idle' ? step : step - cols
  return since % cols
}
