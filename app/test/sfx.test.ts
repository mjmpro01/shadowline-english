import { afterEach, describe, expect, it, vi } from 'vitest'
import { play, setSoundOn, soundOn, unlockSound } from '../src/lib/sfx'

describe('the duel’s sounds', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('make nothing, and break nothing, where there is no Web Audio', () => {
    expect(() => {
      unlockSound()
      play('heavy')
      play('win')
    }).not.toThrow()
  })

  it('are on until turned off, and stay off', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
    expect(soundOn()).toBe(true)
    setSoundOn(false)
    expect(soundOn()).toBe(false)
    setSoundOn(true)
    expect(soundOn()).toBe(true)
  })

  it('stay on when storage refuses', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('private window')
      },
      setItem: () => {
        throw new Error('private window')
      },
    })
    expect(soundOn()).toBe(true)
    expect(() => setSoundOn(false)).not.toThrow()
  })
})
