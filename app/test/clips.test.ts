import { describe, expect, it } from 'vitest'
import {
  allCategories,
  episodeProgress,
  parseCategories,
  clipName,
  nextClipNumber,
  searchClips,
} from '../src/lib/clips'
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

const library = [
  clip({ id: 'a', title: 'Ordering coffee', categories: ['cafe', 'daily'], captions: [{ text: 'A flat white, please.', ipa: '' }] }),
  clip({ id: 'b', title: 'Job interview opener', playlist: 'Work talk', categories: ['interview'], captions: [{ text: 'Thanks for having me.', ipa: '' }] }),
  clip({ id: 'c', title: 'Small talk', playlist: 'Work talk', categories: ['daily', 'interview'], captions: [{ text: 'How was your weekend?', ipa: '' }] }),
]

describe('parseCategories', () => {
  it('splits, trims, lowercases and drops duplicates', () => {
    expect(parseCategories(' Interview, daily ,,interview , News ')).toEqual(['interview', 'daily', 'news'])
  })

  it('treats an empty field as no categories', () => {
    expect(parseCategories('  ,  ')).toEqual([])
  })
})

describe('searchClips', () => {
  it('returns everything when nothing is asked for', () => {
    expect(searchClips(library, {})).toHaveLength(3)
  })

  it('matches the line, not just the name', () => {
    expect(searchClips(library, { query: 'weekend' }).map((c) => c.id)).toEqual(['c'])
  })

  it('matches the playlist and the category too', () => {
    expect(searchClips(library, { query: 'work talk' }).map((c) => c.id)).toEqual(['b', 'c'])
    expect(searchClips(library, { query: 'cafe' }).map((c) => c.id)).toEqual(['a'])
  })

  it('ignores case and surrounding space', () => {
    expect(searchClips(library, { query: '  ORDERING  ' }).map((c) => c.id)).toEqual(['a'])
  })

  it('narrows by category and playlist together', () => {
    expect(searchClips(library, { category: 'daily' }).map((c) => c.id)).toEqual(['a', 'c'])
    expect(searchClips(library, { category: 'daily', playlist: 'Work talk' }).map((c) => c.id)).toEqual(['c'])
  })

  it('combines a filter with a query', () => {
    expect(searchClips(library, { query: 'talk', category: 'interview' }).map((c) => c.id)).toEqual(['b', 'c'])
  })
})

describe('library facets', () => {
  it('lists the categories in use, sorted and deduplicated', () => {
    expect(allCategories(library)).toEqual(['cafe', 'daily', 'interview'])
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

describe('nextClipNumber', () => {
  const named = (title: string, playlist = 'Episode one') => clip({ id: title, title, playlist })

  it('starts at one in an empty playlist', () => {
    expect(nextClipNumber([], 'Episode one')).toBe(1)
    expect(nextClipNumber([named('Clip 1', 'Another')], 'Episode one')).toBe(1)
  })

  it('continues from the highest already there', () => {
    // Publishing more lines into an episode later must not give it a second
    // "Clip 1".
    const videos = [named('Clip 1'), named('Clip 2'), named('Clip 3')]

    expect(nextClipNumber(videos, 'Episode one')).toBe(4)
  })

  it('continues from the highest, not the count', () => {
    // A gap left by a deleted clip does not hand its number out again.
    const videos = [named('Clip 1'), named('Clip 7')]

    expect(nextClipNumber(videos, 'Episode one')).toBe(8)
  })

  it('ignores names the admin chose themselves', () => {
    const videos = [named('Clip 1'), named('The one with the pivot'), named('Clipped')]

    expect(nextClipNumber(videos, 'Episode one')).toBe(2)
  })

  it('counts a name whatever its spacing or case', () => {
    expect(nextClipNumber([named('clip 4')], 'Episode one')).toBe(5)
    expect(nextClipNumber([named('CLIP  9')], 'Episode one')).toBe(10)
  })
})

describe('clipName', () => {
  it('is what the studio and the publish path both write', () => {
    expect(clipName(1)).toBe('Clip 1')
    expect(clipName(12)).toBe('Clip 12')
  })
})
