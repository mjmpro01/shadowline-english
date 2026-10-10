import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  I18nContext,
  LOCALE_STORAGE_KEY,
  LOCALES,
  preferredLocale,
  storedLocale,
  translator,
  type I18n,
  type Locale,
} from '.'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    preferredLocale(storedLocale(), typeof navigator === 'undefined' ? [] : navigator.languages),
  )

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next)
    } catch {
      // A browser that will not remember the choice still has to honour it for
      // this visit, which the state above already did.
    }
    // So screen readers and `:lang()` rules know what they are looking at.
    document.documentElement.lang = next
  }, [])

  const value = useMemo<I18n>(() => {
    return { locale, setLocale, t: translator(LOCALES[locale].messages) }
  }, [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
