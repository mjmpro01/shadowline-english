import type { VocabWord } from '../data/types'

/**
 * The words to review now.
 *
 * The deck used to be every word a learner had ever collected, sorted by
 * status and then by when it last came up. That is an order, not a schedule: a
 * word marked known came back in the very next session, and one forgotten
 * three weeks ago got no priority over it. Spacing is the whole reason to
 * review vocabulary rather than reread it.
 *
 * So a card is in the deck when it is due, and the most overdue comes first. A
 * word nobody has recalled yet is due from the moment it is collected, which
 * is how new words get in without a rule of their own.
 */
export function dueDeck(vocab: VocabWord[], now: Date = new Date()): VocabWord[] {
  return vocab
    .filter((word) => Date.parse(word.dueAt) <= now.getTime())
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.word.localeCompare(b.word))
}

/**
 * Every word, whatever the schedule says.
 *
 * For the learner who has nothing due and wants to practise anyway. The
 * schedule is advice about what is worth reviewing, and refusing somebody who
 * asks for more would be treating it as a rule.
 */
export function wholeDeck(vocab: VocabWord[]): VocabWord[] {
  return [...vocab].sort(
    (a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.word.localeCompare(b.word),
  )
}

/** When the next card falls due, for a learner with none due now. Null when
 *  they have no words at all, or something is due already. */
export function nextDue(vocab: VocabWord[], now: Date = new Date()): Date | null {
  const upcoming = vocab
    .map((word) => Date.parse(word.dueAt))
    .filter((at) => at > now.getTime())
    .sort((a, b) => a - b)
  if (upcoming.length === 0 || upcoming.length !== vocab.length) return null
  return new Date(upcoming[0])
}

/** Whole days from now until `at`, rounded up: a card due in an hour is due
 *  today, and one due tomorrow morning is due tomorrow. */
export function daysUntil(at: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((at.getTime() - now.getTime()) / 86_400_000))
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
