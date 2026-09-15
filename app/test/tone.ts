/**
 * Synthesised speech-like tones with a known pitch contour, so the tracker and
 * the scorer can be checked against melodies whose answer we already know.
 */
export const RATE = 16000

export interface ToneOptions {
  /** Semitones away from the base pitch, given progress through the clip (0..1). */
  melody?: (progress: number) => number
  baseHz?: number
  duration?: number
  /** Amplitude bumps standing in for syllables. */
  syllables?: number
  amplitude?: number
}

export function tone({
  melody = () => 0,
  baseHz = 200,
  duration = 2.4,
  syllables = 4,
  amplitude = 0.25,
}: ToneOptions = {}): Float32Array {
  const count = Math.floor(RATE * duration)
  const samples = new Float32Array(count)
  let phase = 0
  for (let i = 0; i < count; i++) {
    const progress = i / count
    const hz = baseHz * 2 ** (melody(progress) / 12)
    phase += (2 * Math.PI * hz) / RATE
    // A few harmonics: a bare sine invites octave errors that speech does not.
    let value = 0
    for (let harmonic = 1; harmonic <= 6; harmonic++) value += Math.sin(phase * harmonic) / harmonic
    const envelope = Math.max(0.05, Math.abs(Math.sin(Math.PI * syllables * progress)) ** 1.5)
    samples[i] = value * amplitude * envelope
  }
  return samples
}

export const MELODIES = {
  flat: () => 0,
  wide: (p: number) => Math.sin(p * Math.PI * 2) * 4,
  narrow: (p: number) => Math.sin(p * Math.PI * 2) * 1,
  rising: (p: number) => p * 4 - 2,
}

export function silence(duration = 1): Float32Array {
  return new Float32Array(Math.floor(RATE * duration))
}
