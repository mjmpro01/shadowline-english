import { describe, expect, it } from 'vitest'
import { episodeProgress, parseCategories } from '../src/lib/clips'
import type { Video } from '../src/data/types'

const clip = (overrides: Partial<Video>): Video => ({
  id: 'c1',
  title: 'Untitled',
  source: 'lesson.wav',
  playlist: 'Lesson one',
  categories: [],
  featured: false,
  hasVideo: false,
  videoPending: false,
  posterUrl: '',
  startSeconds: 0,
  episodeId: null,
  playlistId: null,
  timestamp: '0:00–0:05',
  durationSeconds: 5,
  summary: '',
  captions: [{ text: '', ipa: '' }],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})


describe('parseCategories', () => {
  it('splits, trims, lowercases and drops duplicates', () => {
    expect(parseCategories(' Interview, daily ,,interview , News ')).toEqual(['interview', 'daily', 'news'])
  })

  it('treats an empty field as no categories', () => {
    expect(parseCategories('  ,  ')).toEqual([])
  })
})

describe('episodeProgress', () => {
  const clips = [clip({ id: 'a' }), clip({ id: 'b' }), clip({ id: 'c' })]

  it('counts what has been practised and points at the next one', () => {
    const progress = episodeProgress(clips, (id) => id === 'a')

    expect(progress).toMatchObject({ total: 3, practised: 1 })
    expect(progress.next?.id).toBe('b')
  })

  it('points at the first gap, not the first clip after the last take', () => {
    // Practising out of order is allowed; "next" is still the first one
    // nobody has been to.
    const progress = episodeProgress(clips, (id) => id === 'c')

    expect(progress.next?.id).toBe('a')
  })

  it('has no next once every clip has a take', () => {
    const progress = episodeProgress(clips, () => true)

    expect(progress).toMatchObject({ total: 3, practised: 3, next: null })
  })

  it('counts a take whatever it scored', () => {
    // Practised means "has been to", not "did well" — that is what the score
    // is for, and a bad take is still a clip you have practised.
    expect(episodeProgress(clips, () => true).practised).toBe(3)
  })
})
