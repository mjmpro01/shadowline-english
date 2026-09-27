import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { LoadFailure, Loading } from '../components/LoadState'
import { useT } from '../i18n'
import type { MessageKey } from '../i18n/en'
import {
  ApiError,
  forgotPassword,
  loginURL,
  loginWithPassword,
  registerWithPassword,
} from '../lib/api'
import { useApp } from '../store/context'

const REMEMBER_EMAIL_KEY = 'shadowline.login.email'

/**
 * What the server's ?error= codes mean, as keys rather than sentences.
 *
 * The wording lives on this side rather than in the API because the API answers
 * a browser navigation, not a fetch: it can only hand back a code, and this is
 * the one place that knows both how the app talks to the person reading it and
 * which language they are reading in.
 */
const LOGIN_ERRORS: Record<string, MessageKey> = {
  expired: 'login.error.expired',
  browser: 'login.error.browser',
  cancelled: 'login.error.cancelled',
  failed: 'login.error.failed',
  server: 'login.error.server',
  suspended: 'login.error.suspended',
}

type Mode = 'login' | 'register' | 'forgot'

export function LoginScreen() {
  const { state, signedIn, reload } = useApp()
  const t = useT()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const [forgotDone, setForgotDone] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_EMAIL_KEY)
      if (saved) {
        setEmail(saved)
        setRemember(true)
      }
    } catch {
      /* private mode — remember stays unchecked */
    }
  }, [])

  if (state === 'loading') return <Loading />
  if (state === 'error') return <LoadFailure />
  if (signedIn) return <Navigate to="/dashboard" replace />

  const code = params.get('error')
  const oauthMessage = code ? t(LOGIN_ERRORS[code] ?? 'login.error.unknown') : null
  const message = formError ?? oauthMessage

  const switchMode = (next: Mode) => {
    setMode(next)
    setFormError(null)
    setForgotDone(false)
    setPassword('')
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setForgotDone(false)
    setBusy(true)
    try {
      if (mode === 'forgot') {
        await forgotPassword(email)
        setForgotDone(true)
        return
      }
      if (mode === 'register') {
        await registerWithPassword(email, password, name.trim() || undefined)
      } else {
        await loginWithPassword(email, password)
      }
      try {
        if (remember) localStorage.setItem(REMEMBER_EMAIL_KEY, email)
        else localStorage.removeItem(REMEMBER_EMAIL_KEY)
      } catch {
        /* ignore */
      }
      await reload()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('login.error.server'))
    } finally {
      setBusy(false)
    }
  }

  const submitLabel =
    busy
      ? t('login.signingIn')
      : mode === 'register'
        ? t('login.register')
        : mode === 'forgot'
          ? t('login.sendReset')
          : t('login.signIn')

  return (
    <div className="login-hero">
      <div className="login-hero-bg" aria-hidden="true" />
      <div className="login-panel">
        <div className="login-crest" aria-hidden="true">
          <img src="/login/crest.png" alt="" width={90} height={90} />
        </div>

        <header className="login-intro">
          <h1 className="login-title">
            <span>{t('login.brand')}</span>
            <span className="login-title-accent">{t('login.brandAccent')}</span>
          </h1>
          <p className="login-tagline">{t('login.tagline')}</p>
        </header>

        {message && (
          <div className="login-alert" role="alert">
            {message}
          </div>
        )}

        {forgotDone && (
          <div className="login-note" role="status">
            {t('login.forgotSent')}
          </div>
        )}

        {/*
          Google stays a navigation out of the app; email/password stays here
          and talks to our API, which talks to Keycloak behind the scenes.
        */}
        <a className="login-google" href={loginURL()}>
          <span className="login-google-mark" aria-hidden="true">
            G
          </span>
          <span>{oauthMessage ? t('login.tryAgain') : t('login.google')}</span>
        </a>

        <div className="login-divider">
          <span />
          <span>{t('login.orEmail')}</span>
          <span />
        </div>

        <form className="login-form" onSubmit={(e) => void onSubmit(e)}>
          {mode === 'register' && (
            <label className="login-field">
              <span>{t('login.name')}</span>
              <span className="login-input">
                <input
                  id="login-name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('login.namePlaceholder')}
                />
              </span>
            </label>
          )}

          <label className="login-field">
            <span>{t('login.emailLabel')}</span>
            <span className="login-input">
              <img src="/login/mail.svg" alt="" width={18} height={18} aria-hidden="true" />
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('login.emailPlaceholder')}
              />
            </span>
          </label>

          {mode !== 'forgot' && (
            <label className="login-field">
              <span>{t('login.password')}</span>
              <span className="login-input">
                <img src="/login/key.svg" alt="" width={18} height={18} aria-hidden="true" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.passwordPlaceholder')}
                />
                <button
                  type="button"
                  className="login-eye"
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  <img
                    src="/login/eye-off.svg"
                    alt=""
                    width={18}
                    height={18}
                    style={{ opacity: showPassword ? 0.45 : 1 }}
                  />
                </button>
              </span>
            </label>
          )}

          {mode === 'login' && (
            <div className="login-options">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span className="login-check" aria-hidden="true">
                  ✓
                </span>
                <span>{t('login.remember')}</span>
              </label>
              <button type="button" className="login-forgot" onClick={() => switchMode('forgot')}>
                {t('login.forgot')}
              </button>
            </div>
          )}

          <button type="submit" className="login-submit" disabled={busy}>
            {submitLabel}
          </button>
        </form>

        <div className="login-switch">
          {mode === 'login' ? (
            <p>
              {t('login.newHero')}{' '}
              <button type="button" onClick={() => switchMode('register')}>
                {t('login.toRegister')}
              </button>
            </p>
          ) : (
            <p>
              <button type="button" onClick={() => switchMode('login')}>
                {t('login.toSignIn')}
              </button>
            </p>
          )}
        </div>

        <div className="login-trust">
          <img src="/login/trust.svg" alt="" width={18} height={18} aria-hidden="true" />
          <p>{t('login.trust')}</p>
        </div>
      </div>
    </div>
  )
}
