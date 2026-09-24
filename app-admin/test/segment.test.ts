import { describe, expect, it } from 'vitest'
import { proposeSegments } from '../src/lib/audio/segment'
import { lines, RATE } from './tone'

describe('proposeSegments', () => {
  it('cuts at the pauses between lines', () => {
    const audio = lines([
      { speech: 2, pause: 0.5 },
      { speech: 3, pause: 0.5 },
      { speech: 2.5, pause: 0.5 },
    ])
    const segments = proposeSegments(audio, RATE, { maxSeconds: 6 })
    expect(segments).toHaveLength(3)
    expect(segments[0].end - segments[0].start).toBeCloseTo(2, 0)
    expect(segments[1].end - segments[1].start).toBeCloseTo(3, 0)
    // Each cut lands inside a pause, not inside speech.
    expect(segments[1].start).toBeGreaterThan(segments[0].end)
  })

  it('never proposes a clip longer than the limit', () => {
    const audio = lines([{ speech: 20, pause: 0.4 }])
    const segments = proposeSegments(audio, RATE, { maxSeconds: 6 })
    expect(segments.length).toBeGreaterThanOrEqual(4)
    for (const segment of segments) {
      expect(segment.end - segment.start).toBeLessThanOrEqual(6.001)
    }
  })

  it('folds a stray fragment into the line beside it', () => {
    const audio = lines([
      { speech: 2, pause: 0.4 },
      { speech: 0.3, pause: 0.4 },
      { speech: 2, pause: 0.4 },
    ])
    const segments = proposeSegments(audio, RATE, { maxSeconds: 6 })
    expect(segments).toHaveLength(2)
  })

  it('ignores a recording that is only room noise', () => {
    expect(proposeSegments(new Float32Array(RATE * 3), RATE, { maxSeconds: 6 })).toEqual([])
  })
})
