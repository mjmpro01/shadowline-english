import { createContext, useContext } from 'react'
import { en, type MessageKey, type Messages } from './en'
import { vi } from './vi'

/** Every language the app speaks, and what to call each one in itself.
 *
 *  Named in its own language rather than in the current one: somebody who has
 *  landed in a language they cannot read needs to find their own in the list,
 *  and "Vietnamese" is no help to them. */
export const LOCALES = {
  en: { name: 'English', messages: en as Messages },
  vi: { name: 'Tiếng Việt', messages: vi },
} as const

export type Locale = keyof typeof LOCALES

export const LOCALE_CODES = Object.keys(LOCALES) as Locale[]

function isLocale(value: string | null): value is Locale {
  return value !== null && value in LOCALES
}

/**
 * Which language to open in.
 *
 * A choice already made wins. Failing that the browser's own preferences, in
 * their order, which is the only thing anybody has told us — `navigator.language`
 * alone would miss somebody whose first preference we do not speak but whose
 * second we do. English last, because it is the one this app is written in.
 *
 * Reading storage can throw in a private window, so it is guarded: a browser
 * that refuses to remember the choice should still show the app.
 */
export function preferredLocale(
  stored: string | null,
  languages: readonly string[] = [],
): Locale {
  if (isLocale(stored)) return stored
  for (const tag of languages) {
    // "vi-VN" and "en-GB" are the common shapes; the region is not ours to care
    // about until there is a locale that differs by one.
    const base = tag.toLowerCase().split('-')[0]
    if (isLocale(base)) return base
  }
  return 'en'
}

/**
 * Looks a message up, and applies its arguments when it takes any.
 *
 * The argument types come from the English, so calling `t('library.takes')`
 * without its count, or with a string, does not compile. That is the point of
 * keeping the messages as a typed object: the alternative is finding out in
 * front of a learner.
 */
export type Translate = <K extends MessageKey>(
  key: K,
  ...args: Messages[K] extends (...a: infer A) => string ? A : []
) => string

export interface I18n {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Translate
}

/** Exported for the provider beside this file, which is the only thing that
 *  should ever write to it. Kept here so the context, its type and the hooks
 *  that read it stay in one place. */
export const I18nContext = createContext<I18n | null>(null)

export function useI18n(): I18n {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n outside I18nProvider')
  return value
}

/** The common case: a component that only needs to read messages. */
export function useT(): Translate {
  return useI18n().t
}
