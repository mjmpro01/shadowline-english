/**
 * How far along a crop is, for drawing it — the server decides when it is
 * actually ready. Pure, so it is tested without a canvas.
 */

/** The growth stage to draw: 0 just planted … stages-1 ripe. */
export function cropStage(plantedAt: number, ripeAt: number, now: number, stages: number): number {
  if (now >= ripeAt) return stages - 1
  const span = ripeAt - plantedAt
  if (span <= 0) return stages - 1
  const done = Math.max(0, (now - plantedAt) / span)
  return Math.min(stages - 2, Math.floor(done * (stages - 1)))
}

/** Seconds until something happens, never below zero. */
export function secondsUntil(at: string | null, now: number): number {
  if (!at) return 0
  return Math.max(0, Math.ceil((Date.parse(at) - now) / 1000))
}

/** 0:42, 12:05, 1:02:30 — a countdown as a clock. */
export function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`
}
