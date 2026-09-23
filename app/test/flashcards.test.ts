import { describe, expect, it } from 'vitest'
import { daysUntil, dueDeck, nextDue, summarise, wholeDeck } from '../src/lib/flashcards'
import type { VocabStatus, VocabWord } from '../src/data/types'

const NOW = new Date('2026-09-23T09:00:00Z')

const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

const word = (
  id: string,
  dueAt: string,
  { status = 'learning' as VocabStatus, intervalDays = 0 } = {},
): VocabWord => ({
  id,
  word: id,
  ipa: `/${id}/`,
  meaning: 'a meaning',
  status,
  videoId: null,
  reviewedAt: null,
  intervalDays,
  dueAt,
})

describe('dueDeck', () => {
  it('holds only the words that are due', () => {
    // The whole point of a schedule: a word you recalled yesterday is not
    // worth asking about today, however few words you have.
    const deck = dueDeck([word('now', day(0)), word('later', day(3))], NOW)
    expect(deck.map((w) => w.id)).toEqual(['now'])
  })

  it('brings the most overdue up first', () => {
    const deck = dueDeck([word('yesterday', day(-1)), word('last week', day(-7))], NOW)
    expect(deck.map((w) => w.id)).toEqual(['last week', 'yesterday'])
  })

  it('includes a word nobody has recalled yet', () => {
    // A new word is due from the moment it is collected, which is how new
    // words get into the deck without a rule of their own.
    const deck = dueDeck([word('fresh', NOW.toISOString(), { intervalDays: 0 })], NOW)
    expect(deck.map((w) => w.id)).toEqual(['fresh'])
  })

  it('does not exempt a word marked known', () => {
    // Known is a label, not an exemption: the date decides.
    const deck = dueDeck([word('overdue', day(-1), { status: 'known', intervalDays: 30 })], NOW)
    expect(deck).toHaveLength(1)
  })

  it('is empty when nothing is due', () => {
    expect(dueDeck([word('a', day(1)), word('b', day(9))], NOW)).toEqual([])
  })

  it('breaks a tie by the word, so two runs deal the same deck', () => {
    const deck = dueDeck([word('beta', day(0)), word('alpha', day(0))], NOW)
    expect(deck.map((w) => w.id)).toEqual(['alpha', 'beta'])
  })
})

describe('wholeDeck', () => {
  it('takes everything, whatever the schedule says', () => {
    // For the learner with nothing due who wants to practise anyway. The
    // schedule is advice about what is worth reviewing, not a rule.
    const deck = wholeDeck([word('later', day(9)), word('overdue', day(-1))])
    expect(deck.map((w) => w.id)).toEqual(['overdue', 'later'])
  })
})

describe('nextDue', () => {
  it('names when the next word comes round', () => {
    expect(nextDue([word('a', day(4)), word('b', day(2))], NOW)?.toISOString()).toBe(day(2))
  })

  it('says nothing when something is due already', () => {
    // There is a deck to offer instead, and a date would read as an excuse.
    expect(nextDue([word('a', day(-1)), word('b', day(2))], NOW)).toBeNull()
  })

  it('says nothing when there are no words at all', () => {
    expect(nextDue([], NOW)).toBeNull()
  })
})

describe('daysUntil', () => {
  it('rounds up, so a card due in an hour is due today', () => {
    expect(daysUntil(new Date(NOW.getTime() + 3_600_000), NOW)).toBe(1)
    expect(daysUntil(new Date(NOW.getTime() + 2 * 86_400_000), NOW)).toBe(2)
  })

  it('never counts backwards', () => {
    expect(daysUntil(new Date(NOW.getTime() - 86_400_000), NOW)).toBe(0)
  })
})

describe('summarise', () => {
  it('counts what was answered and what was known', () => {
    expect(summarise({ a: 'known', b: 'learning', c: 'known' }, 5)).toEqual({
      reviewed: 3,
      known: 2,
      total: 5,
    })
  })
})
