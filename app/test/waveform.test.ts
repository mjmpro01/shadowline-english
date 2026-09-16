import { describe, expect, it } from 'vitest'
import { peaks } from '../src/lib/audio/decode'

/** A column's worth of samples alternating between +level and -level. */
function block(samples: Float32Array, from: number, length: number, level: number): void {
  for (let i = from; i < from + length; i++) samples[i] = i % 2 === 0 ? level : -level
}

describe('peaks', () => {
  it('keeps loud and quiet apart where min and max cannot', () => {
    // What a long recording looks like: every column holds seconds of speech,
    // so each one touches full scale at some point and min/max says the same
    // thing about all of them.
    const samples = new Float32Array(300)
    block(samples, 0, 100, 1) // loud throughout
    block(samples, 100, 100, 0.05) // quiet throughout
    block(samples, 200, 100, 1)
    // One loud transient in an otherwise quiet stretch, swinging both ways as
    // a real one does. This is the case that saturates min/max.
    samples[150] = 1
    samples[151] = -1

    const [loud, quiet, alsoLoud] = peaks(samples, 3)

    // min/max cannot separate the quiet column from the loud ones.
    expect(quiet.max).toBe(loud.max)
    expect(quiet.min).toBe(loud.min)

    // rms can, which is why the waveform is drawn from it.
    expect(quiet.rms).toBeLessThan(loud.rms / 5)
    expect(alsoLoud.rms).toBeCloseTo(loud.rms, 5)
  })

  it('reports rms between zero and the peak', () => {
    const samples = new Float32Array(100)
    block(samples, 0, 100, 0.5)

    const [column] = peaks(samples, 1)

    expect(column.rms).toBeCloseTo(0.5, 5)
    expect(column.rms).toBeLessThanOrEqual(Math.max(column.max, -column.min))
  })

  it('gives silence no body at all', () => {
    const [column] = peaks(new Float32Array(100), 1)

    expect(column.rms).toBe(0)
    expect(column.min).toBe(0)
    expect(column.max).toBe(0)
  })

  // A column starting past the end of the samples counts nothing, and dividing
  // by that would put NaN into the path the wave is drawn from.
  it('never returns NaN when there are more columns than samples', () => {
    const columns = peaks(new Float32Array(4), 16)

    expect(columns).toHaveLength(16)
    for (const column of columns) {
      expect(Number.isNaN(column.rms)).toBe(false)
    }
  })
})
