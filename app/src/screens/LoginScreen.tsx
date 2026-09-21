import { useState, type FormEvent } from 'react'
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
  const [formError, setFormError] = useState<string | null>(null)
  const [forgotDone, setForgotDone] = useState(false)

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
      await reload()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('login.error.server'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 360 }} className="stack gap-4">
        <div className="stack" style={{ gap: 4 }}>
          <h1 style={{ fontSize: 34, margin: 0 }}>Shadowline</h1>
          <div style={{ fontSize: 14, opacity: 0.65 }}>{t('login.tagline')}</div>
        </div>

        {message && (
          <div
            role="alert"
            style={{
              fontSize: 14,
              lineHeight: 1.4,
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--score-attention)',
              border: '1px solid color-mix(in srgb, var(--score-attention) 45%, transparent)',
              background: 'color-mix(in srgb, var(--score-attention) 12%, transparent)',
            }}
          >
            {message}
          </div>
        )}

        {forgotDone && (
          <div
            role="status"
            style={{
              fontSize: 14,
              lineHeight: 1.4,
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid color-mix(in srgb, var(--ink) 18%, transparent)',
            }}
          >
            {t('login.forgotSent')}
          </div>
        )}

        {/*
          Google stays a navigation out of the app; email/password stays here
          and talks to our API, which talks to Keycloak behind the scenes.
        */}
        <a className="btn btn-secondary btn-block" href={loginURL()}>
          {oauthMessage ? t('login.tryAgain') : t('login.google')}
        </a>

        <div className="card-meta" style={{ textAlign: 'center' }}>
          {t('login.orEmail')}
        </div>

        <form className="stack gap-3" onSubmit={(e) => void onSubmit(e)}>
          {mode === 'register' && (
            <div className="field" style={{ textAlign: 'left' }}>
              <label htmlFor="login-name">{t('login.name')}</label>
              <input
                id="login-name"
                className="input"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <div className="field" style={{ textAlign: 'left' }}>
            <label htmlFor="login-email">{t('login.emailLabel')}</label>
            <input
              id="login-email"
              className="input"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {mode !== 'forgot' && (
            <div className="field" style={{ textAlign: 'left' }}>
              <label htmlFor="login-password">{t('login.password')}</label>
              <input
                id="login-password"
                className="input"
                type="password"
                required
                minLength={mode === 'register' ? 8 : undefined}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy
              ? t('login.signingIn')
              : mode === 'register'
                ? t('login.register')
                : mode === 'forgot'
                  ? t('login.sendReset')
                  : t('login.signIn')}
          </button>
        </form>

        <div className="stack gap-2" style={{ textAlign: 'center', fontSize: 14 }}>
          {mode === 'login' && (
            <>
              <button type="button" className="linkish" onClick={() => switchMode('forgot')}>
                {t('login.forgot')}
              </button>
              <button type="button" className="linkish" onClick={() => switchMode('register')}>
                {t('login.toRegister')}
              </button>
            </>
          )}
          {mode !== 'login' && (
            <button type="button" className="linkish" onClick={() => switchMode('login')}>
              {t('login.toSignIn')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
