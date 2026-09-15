import { describe, expect, it } from 'vitest'
import { compareContours, pitchRange } from '../src/lib/dsp/compare'
import { semitoneTrack, trackPitch } from '../src/lib/dsp/pitch'
import { MELODIES, RATE, silence, tone, type ToneOptions } from './tone'

const contourOf = (options: ToneOptions) => trackPitch(tone(options), RATE)
const reference = () => contourOf({ melody: MELODIES.wide })

describe('compareContours', () => {
  it('gives a perfect score to an identical delivery', () => {
    const result = compareContours(reference(), contourOf({ melody: MELODIES.wide }))
    expect(result).not.toBeNull()
    expect(result!.score).toBe(100)
    expect(result!.meanDeviation).toBeLessThan(0.1)
  })

  it('ignores vocal register: the same melody an octave down still scores full marks', () => {
    const result = compareContours(reference(), contourOf({ melody: MELODIES.wide, baseHz: 100 }))
    expect(result!.scores.Intonation).toBeGreaterThan(95)
    expect(result!.score).toBeGreaterThan(95)
  })

  it('marks down a monotone reading of a melodic line', () => {
    const result = compareContours(reference(), contourOf({ melody: MELODIES.flat }))
    expect(result!.scores.Intonation).toBeLessThan(75)
    expect(result!.scores.Variation).toBeLessThan(10)
    expect(result!.score).toBeLessThan(60)
  })

  it('scores variation by how much of the source range the voice covers', () => {
    // A quarter of the reference's range should read as roughly a quarter.
    const result = compareContours(reference(), contourOf({ melody: MELODIES.narrow }))
    expect(result!.scores.Variation).toBeGreaterThan(15)
    expect(result!.scores.Variation).toBeLessThan(40)
  })

  it('credits the melody but penalises the tempo when a take runs slow', () => {
    const result = compareContours(reference(), contourOf({ melody: MELODIES.wide, duration: 3.6 }))
    expect(result!.scores.Intonation).toBeGreaterThan(90)
    expect(result!.scores.Rhythm).toBeLessThan(95)
  })

  it('separates a rising line from a rise-and-fall line', () => {
    const result = compareContours(reference(), contourOf({ melody: MELODIES.rising }))
    expect(result!.scores.Intonation).toBeLessThan(70)
  })

  it('returns nothing when there is no voiced audio to compare', () => {
    expect(compareContours(reference(), trackPitch(silence(), RATE))).toBeNull()
  })
})

describe('pitchRange', () => {
  it('measures the 10th-90th percentile spread in semitones', () => {
    const wide = pitchRange(semitoneTrack(contourOf({ melody: MELODIES.wide })))
    const narrow = pitchRange(semitoneTrack(contourOf({ melody: MELODIES.narrow })))
    expect(wide).toBeGreaterThan(narrow * 2)
  })
})
