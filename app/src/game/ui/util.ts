import { useEffect, useState } from 'react'
import type { Locale, Translate } from '../../i18n'
import type { MessageKey } from '../../i18n/en'
import { ApiError } from '../../lib/api'
import { explain } from '../../lib/errors'
import type { Bilingual } from '../api'

/** A line in the learner's language. */
export const pick = (text: Bilingual, locale: Locale) => (locale === 'vi' ? text.vi : text.en)

/** Re-renders every `ms`, for countdowns. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}

/** What to tell the player when the farm says no, in their language. */
const REFUSALS = [
  'no_stamina', 'no_gold', 'not_ripe', 'occupied', 'locked', 'no_seed', 'empty', 'rested',
  'full', 'no_item', 'unlocked', 'max_level', 'not_done', 'claimed', 'no_quest',
  'woods_locked', 'no_hp', 'in_battle', 'respawning', 'battle_over',
]

export function gameError(err: unknown, t: Translate): string {
  if (err instanceof ApiError && err.code && REFUSALS.includes(err.code)) {
    return t(`arena.err.${err.code}` as Extract<MessageKey, 'arena.err.no_gold'>)
  }
  return explain(err, t, t('arena.loadFailed'))
}
