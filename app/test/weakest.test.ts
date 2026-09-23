import { describe, expect, it } from 'vitest'
import { weakestOverall } from '../src/lib/practice'
import type { Take } from '../src/data/types'

const take = (videoId: string, score: number, scores?: Record<string, number>): Take =>
  ({
    id: `${videoId}-${score}`,
    videoId,
    recordedAt: '2026-01-01T00:00:00Z',
    status: 'scored',
    score,
    scores: scores ?? null,
    hasAudio: true,
    error: null,
  }) as unknown as Take

describe('weakestOverall', () => {
  it('has nothing to say before anything is scored', () => {
    expect(weakestOverall([])).toBeNull()
    // A take with a score but no per-metric breakdown is not a measurement of
    // any one of them.
    expect(weakestOverall([take('a', 70)])).toBeNull()
  })

  it('names the lowest average', () => {
    const scores = { Intonation: 80, Rhythm: 70, Stress: 40, Variation: 90 }
    expect(weakestOverall([take('a', 70, scores)])).toBe('Stress')
  })

  it('averages rather than following the last take', () => {
    // One bad recording is a bad recording, not a weakness. Rhythm is worse on
    // average even though Stress was worse in the second take.
    const first = { Intonation: 90, Rhythm: 30, Stress: 90, Variation: 90 }
    const second = { Intonation: 90, Rhythm: 30, Stress: 40, Variation: 90 }
    expect(weakestOverall([take('a', 70, first), take('b', 70, second)])).toBe('Rhythm')
  })
})
