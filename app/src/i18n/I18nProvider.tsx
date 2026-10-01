import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { I18nContext, LOCALES, preferredLocale, translator, type I18n, type Locale } from '.'

const STORAGE_KEY = 'shadowline.locale'

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    // A private window can refuse to hand this over. Not remembering the
    // choice is survivable; failing to render the app is not.
    return null
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    preferredLocale(readStored(), typeof navigator === 'undefined' ? [] : navigator.languages),
  )

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
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
