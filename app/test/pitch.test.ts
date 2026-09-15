import { describe, expect, it } from 'vitest'
import { semitoneTrack, trackPitch } from '../src/lib/dsp/pitch'
import { MELODIES, RATE, silence, tone } from './tone'

describe('trackPitch', () => {
  it('recovers the fundamental of a steady tone', () => {
    const contour = trackPitch(tone({ baseHz: 200 }), RATE)
    expect(contour.medianHz).toBeGreaterThan(197)
    expect(contour.medianHz).toBeLessThan(203)
  })

  it('does not jump an octave on a low voice', () => {
    const contour = trackPitch(tone({ baseHz: 100 }), RATE)
    expect(contour.medianHz).toBeGreaterThan(97)
    expect(contour.medianHz).toBeLessThan(103)
  })

  it('tracks a high voice too', () => {
    const contour = trackPitch(tone({ baseHz: 320 }), RATE)
    expect(contour.medianHz).toBeGreaterThan(313)
    expect(contour.medianHz).toBeLessThan(327)
  })

  it('reports no pitch for silence', () => {
    const contour = trackPitch(silence(), RATE)
    expect(contour.frames.every((frame) => frame.hz === null)).toBe(true)
    expect(contour.medianHz).toBe(0)
  })

  it('measures the full span of a glide', () => {
    // A full octave rise should read as roughly twelve semitones of span.
    const contour = trackPitch(tone({ melody: (p) => p * 12, syllables: 1 }), RATE)
    const semitones = semitoneTrack(contour).map((point) => point.semitone)
    const span = Math.max(...semitones) - Math.min(...semitones)
    expect(span).toBeGreaterThan(10.5)
    expect(span).toBeLessThan(13.5)
  })

  it('centres the semitone track on the speaker median', () => {
    const track = semitoneTrack(trackPitch(tone({ melody: MELODIES.wide }), RATE))
    const mean = track.reduce((sum, p) => sum + p.semitone, 0) / track.length
    expect(Math.abs(mean)).toBeLessThan(1)
  })
})
