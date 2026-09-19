import { describe, expect, it } from 'vitest'
import {
  allCategories,
  allPlaylists,
  parseCategories,
  playlistClips,
  playlistProgress,
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
  it('lists the categories and playlists in use, sorted and deduplicated', () => {
    expect(allCategories(library)).toEqual(['cafe', 'daily', 'interview'])
    expect(allPlaylists(library)).toEqual(['Lesson one', 'Work talk'])
  })
})


describe('playlistClips', () => {
  const ep = (id: string, startSeconds: number, title: string, playlist = 'Episode one') =>
    clip({ id, startSeconds, title, playlist })

  it('orders an episode by when each line was spoken', () => {
    // Deliberately out of publish order: an admin can go back and cut a line
    // they skipped, and the episode still reads in the order it was said.
    const videos = [ep('c', 12, 'Third'), ep('a', 2, 'First'), ep('b', 7, 'Second')]

    expect(playlistClips(videos, 'Episode one').map((v) => v.title)).toEqual([
      'First',
      'Second',
      'Third',
    ])
  })

  it('leaves out clips from other playlists', () => {
    const videos = [ep('a', 2, 'Mine'), ep('b', 1, 'Theirs', 'Episode two')]

    expect(playlistClips(videos, 'Episode one').map((v) => v.title)).toEqual(['Mine'])
  })

  it('falls back to the title when nothing has a start time', () => {
    // The starter clips came from no recording, so they all report zero.
    const videos = [ep('a', 0, 'Beta'), ep('b', 0, 'Alpha')]

    expect(playlistClips(videos, 'Episode one').map((v) => v.title)).toEqual(['Alpha', 'Beta'])
  })

  it('does not reorder the array it was given', () => {
    const videos = [ep('c', 12, 'Third'), ep('a', 2, 'First')]
    playlistClips(videos, 'Episode one')

    expect(videos.map((v) => v.title)).toEqual(['Third', 'First'])
  })
})

describe('playlistProgress', () => {
  const clips = [clip({ id: 'a' }), clip({ id: 'b' }), clip({ id: 'c' })]

  it('counts what has been practised and points at the next one', () => {
    const progress = playlistProgress(clips, (id) => id === 'a')

    expect(progress).toMatchObject({ total: 3, practised: 1 })
    expect(progress.next?.id).toBe('b')
  })

  it('points at the first gap, not the first clip after the last take', () => {
    // Practising out of order is allowed; "next" is still the first one
    // nobody has been to.
    const progress = playlistProgress(clips, (id) => id === 'c')

    expect(progress.next?.id).toBe('a')
  })

  it('has no next once every clip has a take', () => {
    const progress = playlistProgress(clips, () => true)

    expect(progress).toMatchObject({ total: 3, practised: 3, next: null })
  })

  it('counts a take whatever it scored', () => {
    // Practised means "has been to", not "did well" — that is what the score
    // is for, and a bad take is still a clip you have practised.
    expect(playlistProgress(clips, () => true).practised).toBe(3)
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
