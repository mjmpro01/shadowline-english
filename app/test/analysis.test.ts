import { describe, expect, it } from 'vitest'
import { chartFromAnalysis } from '../src/lib/chart'
import { summariseTake } from '../src/lib/summary'
import type { TakeAnalysis } from '../src/data/types'

const analysis = (overrides: Partial<TakeAnalysis> = {}): TakeAnalysis => ({
  user: [
    { t: 0, s: 0, d: 0.2 },
    { t: 0.1, s: 1, d: 0.4 },
    { t: 0.2, s: 2, d: 2.6 },
    { t: 0.3, s: 1, d: 1.5 },
  ],
  reference: [
    { t: 0, s: 0 },
    { t: 0.15, s: 1.5 },
    { t: 0.3, s: 0.5 },
  ],
  duration: 0.3,
  meanDeviation: 1.2,
  ...overrides,
})

describe('chartFromAnalysis', () => {
  it('draws a tolerance band around the reference', () => {
    const chart = chartFromAnalysis(analysis())
    expect(chart.bandPath).not.toBe('')
    expect(chart.refPoints.split(' ')).toHaveLength(3)
  })

  it('leaves out the band when there is nothing to compare against', () => {
    const chart = chartFromAnalysis(analysis({ reference: null }))
    expect(chart.bandPath).toBe('')
    expect(chart.refPoints).toBe('')
    expect(chart.segments.length).toBeGreaterThan(0)
  })

  it('colours each segment by how far it strayed', () => {
    const colours = chartFromAnalysis(analysis()).segments.map((segment) => segment.color)
    expect(colours[0]).toBe('var(--score-good)')
    expect(colours[2]).toBe('var(--score-attention)')
  })

  it('does not draw a line across a pause', () => {
    const withGap = analysis({
      user: [
        { t: 0, s: 0 },
        { t: 0.1, s: 1 },
        { t: 1.4, s: 2 },
      ],
      duration: 1.4,
    })
    expect(chartFromAnalysis(withGap).segments).toHaveLength(1)
  })

  it('labels short takes in tenths rather than repeating whole seconds', () => {
    expect(chartFromAnalysis(analysis({ duration: 2.4 })).xLabels).toEqual(['0.0s', '0.6s', '1.2s', '1.8s'])
    expect(chartFromAnalysis(analysis({ duration: 80 })).xLabels[3]).toBe('1:00')
  })
})

describe('summariseTake', () => {
  it('names the strongest and weakest measures', () => {
    const text = summariseTake({ Intonation: 88, Rhythm: 60, Stress: 74, Variation: 81 }, 1.2)
    expect(text).toContain('1.2 semitones')
    expect(text).toContain('Intonation')
    expect(text).toContain('rhythm')
  })

  it('says so when everything landed together', () => {
    const text = summariseTake({ Intonation: 80, Rhythm: 78, Stress: 82, Variation: 79 }, 0.5)
    expect(text).toContain('close together')
  })

  it('leaves out the distance when nothing was measured against', () => {
    const text = summariseTake({ Intonation: 80, Rhythm: 60, Stress: 70, Variation: 75 }, null)
    expect(text).not.toContain('semitone')
  })
})
