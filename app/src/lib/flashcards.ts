import type { VocabWord } from '../data/types'

const ORDER = { new: 0, learning: 1, known: 2 } as const

/**
 * The order words come up in memory practice.
 *
 * Words you have not learnt come first, and within a status the ones you have
 * not seen for longest come first — so a second session is not the same cards
 * in the same order. Words already marked known are kept at the back rather
 * than dropped: they are what you are trying not to forget.
 */
export function buildDeck(vocab: VocabWord[]): VocabWord[] {
  return [...vocab].sort((a, b) => {
    const byStatus = ORDER[a.status] - ORDER[b.status]
    if (byStatus !== 0) return byStatus
    // Never reviewed sorts ahead of anything that has been.
    const seenA = a.reviewedAt ?? ''
    const seenB = b.reviewedAt ?? ''
    if (seenA !== seenB) return seenA < seenB ? -1 : 1
    return a.word.localeCompare(b.word)
  })
}

export interface DeckProgress {
  reviewed: number
  known: number
  total: number
}

export function summarise(results: Record<string, 'known' | 'learning'>, total: number): DeckProgress {
  const values = Object.values(results)
  return {
    reviewed: values.length,
    known: values.filter((value) => value === 'known').length,
    total,
  }
}
