import { describe, expect, it } from 'vitest'
import { nextUp, weakestOverall } from '../src/lib/practice'
import type { Take, Video } from '../src/data/types'

const video = (id: string): Video =>
  ({
    id,
    title: id,
    source: 'x',
    playlist: 'p',
    categories: [],
    featured: false,
    timestamp: '',
    durationSeconds: 3,
    summary: '',
    captions: [{ text: 'a line', ipa: '' }],
    hasVideo: false,
    videoPending: false,
    posterUrl: '',
    startSeconds: 0,
  }) as unknown as Video

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

describe('nextUp', () => {
  it('has nothing to offer from an empty library', () => {
    expect(nextUp([], [])).toBeNull()
  })

  it('offers a clip never practised before anything else', () => {
    const videos = [video('a'), video('b'), video('c')]
    expect(nextUp([take('a', 90)], videos)?.id).toBe('b')
  })

  it('falls back to the weakest once everything has been tried', () => {
    const videos = [video('a'), video('b')]
    const takes = [take('a', 90), take('b', 40)]
    expect(nextUp(takes, videos)?.id).toBe('b')
  })

  it('judges a clip on its best take, not its worst', () => {
    const videos = [video('a'), video('b')]
    // `a` has a bad take and a great one; `b` is middling throughout. Having
    // already managed 95 on `a` means it is not the one to go back to.
    const takes = [take('a', 20), take('a', 95), take('b', 55)]
    expect(nextUp(takes, videos)?.id).toBe('b')
  })
})
