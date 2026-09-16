import { describe, expect, it } from 'vitest'
import { allCategories, allPlaylists, parseCategories, searchClips } from '../src/lib/clips'
import type { Video } from '../src/data/types'

const clip = (overrides: Partial<Video>): Video => ({
  id: 'c1',
  title: 'Untitled',
  source: 'lesson.wav',
  playlist: 'Lesson one',
  categories: [],
  timestamp: '0:00–0:05',
  duration: '0:05',
  summary: '',
  captions: [{ text: '', ipa: '' }],
  sourceAudioKey: null,
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
