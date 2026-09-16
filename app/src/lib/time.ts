/** Seconds as m:ss, the way every duration in the app is written. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${(whole % 60).toString().padStart(2, '0')}`
}
