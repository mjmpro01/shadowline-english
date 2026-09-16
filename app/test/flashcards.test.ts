import { describe, expect, it } from 'vitest'
import { buildDeck, summarise } from '../src/lib/flashcards'
import type { VocabStatus, VocabWord } from '../src/data/types'

const word = (id: string, status: VocabStatus, reviewedAt: string | null = null): VocabWord => ({
  id,
  word: id,
  ipa: `/${id}/`,
  meaning: 'a meaning',
  status,
  videoId: null,
  reviewedAt,
})

describe('buildDeck', () => {
  it('puts the words you have not learnt first', () => {
    const deck = buildDeck([word('c', 'known'), word('a', 'learning'), word('b', 'new')])
    expect(deck.map((w) => w.id)).toEqual(['b', 'a', 'c'])
  })

  it('keeps known words in the deck rather than dropping them', () => {
    expect(buildDeck([word('a', 'known'), word('b', 'known')])).toHaveLength(2)
  })

  it('brings up the least recently seen first within a status', () => {
    const deck = buildDeck([
      word('recent', 'new', '2026-09-16T10:00:00Z'),
      word('older', 'new', '2026-09-10T10:00:00Z'),
      word('unseen', 'new', null),
    ])
    expect(deck.map((w) => w.id)).toEqual(['unseen', 'older', 'recent'])
  })

  it('does not reorder the caller-s array', () => {
    const vocab = [word('c', 'known'), word('a', 'new')]
    buildDeck(vocab)
    expect(vocab.map((w) => w.id)).toEqual(['c', 'a'])
  })

  it('handles an empty vocabulary', () => {
    expect(buildDeck([])).toEqual([])
  })
})

describe('summarise', () => {
  it('counts what was answered and how much was marked known', () => {
    expect(summarise({ a: 'known', b: 'learning', c: 'known' }, 8)).toEqual({ reviewed: 3, known: 2, total: 8 })
  })

  it('starts at nothing reviewed', () => {
    expect(summarise({}, 4)).toEqual({ reviewed: 0, known: 0, total: 4 })
  })
})
