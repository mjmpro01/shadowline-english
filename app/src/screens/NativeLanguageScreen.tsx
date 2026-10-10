import { useState, type FormEvent } from 'react'
import { LOCALE_CODES, LOCALES, useI18n, type Locale } from '../i18n'
import { explain } from '../lib/errors'
import { useApp } from '../store/context'

/**
 * The one question asked on the first sign-in: which language is yours.
 *
 * Picking a language switches the screen into it straight away, so the learner
 * reads the rest of the question — and the button — in the language they just
 * chose, and can see it is the right one before saying so. Nothing is saved
 * until Continue.
 */
export function NativeLanguageScreen() {
  const { data, setNativeLanguage } = useApp()
  const { t, locale, setLocale } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const choose = (code: Locale) => {
    setError(null)
    setLocale(code)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // Also stored on this browser by setLocale, so the choice holds even if
      // the account's copy has not arrived yet on the next load.
      setLocale(locale)
      await setNativeLanguage(locale)
    } catch (err) {
      setError(explain(err, t, t('login.error.server')))
      setBusy(false)
    }
  }

  const firstName = data.profile?.name.split(' ')[0] ?? ''

  return (
    <main className="login-hero">
      <div className="login-hero-bg" aria-hidden="true" />
      <form className="login-panel native-panel" onSubmit={(e) => void onSubmit(e)}>
        <div className="login-crest" aria-hidden="true">
          <img src="/login/crest.webp" alt="" width={90} height={90} />
        </div>

        {/* Keyed on the language so the words visibly change when it does. */}
        <header key={locale} className="login-intro native-intro">
          <p className="native-welcome">{t('native.welcome', firstName)}</p>
          <h1 className="login-title native-title">{t('native.title')}</h1>
          <p className="login-tagline">{t('native.subtitle')}</p>
        </header>

        {error && (
          <div key={error} className="login-alert" role="alert">
            {error}
          </div>
        )}

        <fieldset className="native-options">
          <legend className="visually-hidden">{t('native.label')}</legend>
          {LOCALE_CODES.map((code) => (
            <label key={code} className="native-option" lang={code}>
              <input
                type="radio"
                name="native-language"
                value={code}
                checked={code === locale}
                onChange={() => choose(code)}
              />
              <span className="native-code" aria-hidden="true">
                {code.toUpperCase()}
              </span>
              <span className="native-names">
                <span className="native-name">{LOCALES[code].name}</span>
                <span className="native-hello" aria-hidden="true">
                  {LOCALES[code].hello}
                </span>
              </span>
              <span className="native-tick" aria-hidden="true">
                ✓
              </span>
            </label>
          ))}
        </fieldset>

        <p className="native-more">{t('native.more')}</p>

        <button type="submit" className="login-submit" disabled={busy} aria-busy={busy}>
          {busy && <span className="login-spinner" aria-hidden="true" />}
          <span>{busy ? t('native.saving') : t('native.continue')}</span>
        </button>
      </form>
    </main>
  )
}
