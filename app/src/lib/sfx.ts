/**
 * The duel's sounds, made on the spot with Web Audio: no files to fetch, and
 * nothing at all where there is no Web Audio, or when the learner turned the
 * sound off. iOS lets a page make sound only after a tap, so `unlockSound` is
 * called from one before the first sound is wanted.
 */

const KEY = 'shadowline.arena.sound'

export type Sfx = 'light' | 'heavy' | 'special' | 'block' | 'hit' | 'ko' | 'win' | 'tick'

/** Whether the duel makes sound: on unless the learner turned it off. */
export function soundOn(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setSoundOn(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // A private window may refuse; the sound then follows this visit only.
  }
}

type AudioCtor = typeof AudioContext
let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (!soundOn() || typeof window === 'undefined') return null
  const Ctor: AudioCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
  if (!Ctor) return null
  try {
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Called from a tap, so later sounds are allowed. */
export function unlockSound(): void {
  audio()
}

function tone(a: AudioContext, at: number, from: number, to: number, seconds: number, type: OscillatorType, volume: number) {
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, at)
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + seconds)
  gain.gain.setValueAtTime(volume, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds)
  osc.connect(gain).connect(a.destination)
  osc.start(at)
  osc.stop(at + seconds + 0.02)
}

function noise(a: AudioContext, at: number, seconds: number, volume: number, cutoff: number) {
  const length = Math.max(1, Math.floor(a.sampleRate * seconds))
  const buffer = a.createBuffer(1, length, a.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
  const src = a.createBufferSource()
  src.buffer = buffer
  const filter = a.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = cutoff
  const gain = a.createGain()
  gain.gain.value = volume
  src.connect(filter).connect(gain).connect(a.destination)
  src.start(at)
}

/** Plays one of the duel's sounds. */
export function play(sfx: Sfx): void {
  const a = audio()
  if (!a) return
  const t = a.currentTime + 0.01
  try {
    switch (sfx) {
      case 'light':
        noise(a, t, 0.08, 0.35, 2500)
        tone(a, t, 140, 70, 0.1, 'sine', 0.5)
        break
      case 'heavy':
        noise(a, t, 0.16, 0.5, 1800)
        tone(a, t, 100, 40, 0.22, 'sine', 0.7)
        break
      case 'special':
        tone(a, t, 180, 1100, 0.35, 'sawtooth', 0.18)
        noise(a, t + 0.3, 0.2, 0.5, 3000)
        tone(a, t + 0.3, 90, 35, 0.3, 'sine', 0.7)
        break
      case 'block':
        tone(a, t, 1250, 1100, 0.12, 'square', 0.12)
        tone(a, t, 1870, 1700, 0.18, 'triangle', 0.15)
        break
      case 'hit':
        tone(a, t, 170, 80, 0.14, 'sine', 0.55)
        noise(a, t, 0.1, 0.3, 900)
        break
      case 'ko':
        tone(a, t, 420, 70, 0.7, 'triangle', 0.3)
        break
      case 'win':
        ;[523, 659, 784, 1047].forEach((f, i) => tone(a, t + i * 0.11, f, f, 0.16, 'triangle', 0.22))
        break
      case 'tick':
        tone(a, t, 880, 880, 0.04, 'sine', 0.08)
        break
    }
  } catch {
    // A sound that cannot be made is no reason to stop the duel.
  }
}
