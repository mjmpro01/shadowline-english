import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { LoadFailure, Loading } from '../components/LoadState'
import { useT } from '../i18n'
import type { MessageKey } from '../i18n/en'
import { forgotPassword, loginURL, loginWithPassword, registerWithPassword } from '../lib/api'
import { useApp } from '../store/context'
import { explain } from '../lib/errors'

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
  unverified: 'login.error.unverified',
}

type Mode = 'login' | 'register' | 'forgot'

const STRENGTH: MessageKey[] = [
  'login.strength.weak',
  'login.strength.weak',
  'login.strength.fair',
  'login.strength.good',
  'login.strength.strong',
]

/**
 * A rough 0–4 for the meter under a new password. Not a policy — the server
 * only insists on eight characters — just a nudge towards a better one while
 * the learner is still typing it.
 */
function passwordStrength(password: string): number {
  if (!password) return 0
  if (password.length < 8) return 1
  let score = 1
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  return Math.min(4, score)
}

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
  // A registration the server will not sign in until the address is
  // confirmed: the link is in the mail, and that is the whole message.
  const [verifySent, setVerifySent] = useState(false)

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
    setVerifySent(false)
    setPassword('')
    setShowPassword(false)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setForgotDone(false)
    setVerifySent(false)
    setBusy(true)
    try {
      if (mode === 'forgot') {
        await forgotPassword(email)
        setForgotDone(true)
        return
      }
      if (mode === 'register') {
        const registered = await registerWithPassword(email, password, name.trim() || undefined)
        if (registered.verify) {
          setVerifySent(true)
          return
        }
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
      setFormError(explain(err, t, t('login.error.server')))
    } finally {
      setBusy(false)
    }
  }

  const submitLabel = busy
    ? mode === 'register'
      ? t('login.creating')
      : mode === 'forgot'
        ? t('login.sending')
        : t('login.signingIn')
    : mode === 'register'
      ? t('login.register')
      : mode === 'forgot'
        ? t('login.sendReset')
        : t('login.signIn')

  const strength = mode === 'register' ? passwordStrength(password) : 0
  // Once the mail is on its way the form has nothing left to ask: the panel
  // turns into the one thing to do next.
  const sent = forgotDone || verifySent

  return (
    <main className="login-hero">
      <div className="login-hero-bg" aria-hidden="true" />
      <div className="login-panel">
        <div className="login-crest" aria-hidden="true">
          <img src="/login/crest.webp" alt="" width={90} height={90} />
        </div>

        <header className="login-intro">
          <h1 className="login-title">
            <span>{t('login.brand')}</span>
            <span className="login-title-accent">{t('login.brandAccent')}</span>
          </h1>
          <p className="login-tagline">{t('login.tagline')}</p>
        </header>

        {message && (
          // Keyed on the text so a second failure shakes again rather than
          // sitting still and looking like the old one.
          <div key={message} className="login-alert" role="alert">
            {message}
          </div>
        )}

        {sent && (
          <div className="login-sent" role="status">
            <svg className="login-sent-mark" viewBox="0 0 52 52" aria-hidden="true">
              <circle cx="26" cy="26" r="23" />
              <path d="M15 27l7 7 15-16" />
            </svg>
            <h2>{t('login.checkInbox')}</h2>
            {email && <p className="login-sent-email">{email}</p>}
            <p>{verifySent ? t('login.verifySent') : t('login.forgotSent')}</p>
            <button type="button" className="login-submit" onClick={() => switchMode('login')}>
              {t('login.toSignIn')}
            </button>
          </div>
        )}

        {!sent && (
          <>
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

            {mode !== 'forgot' && (
              <div
                className="login-tabs"
                role="group"
                aria-label={t('login.modes')}
                data-mode={mode}
              >
                <span className="login-tabs-pill" aria-hidden="true" />
                <button
                  type="button"
                  aria-pressed={mode === 'login'}
                  onClick={() => mode !== 'login' && switchMode('login')}
                >
                  {t('login.signIn')}
                </button>
                <button
                  type="button"
                  aria-pressed={mode === 'register'}
                  onClick={() => mode !== 'register' && switchMode('register')}
                >
                  {t('login.register')}
                </button>
              </div>
            )}

            {/* Keyed on the mode so the fields that change arrive with a little
            movement, instead of the form silently growing a box. */}
            <form
              key={mode}
              className="login-form"
              data-mode={mode}
              onSubmit={(e) => void onSubmit(e)}
            >
              <p className="login-hint">{t(`login.hint.${mode}`)}</p>

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
                      aria-describedby={mode === 'register' ? 'login-password-rule' : undefined}
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
              {mode === 'register' && (
                <span className="login-strength" data-level={strength}>
                  <span
                    className="login-strength-bars"
                    role="meter"
                    aria-label={t('login.strength.label')}
                    aria-valuemin={0}
                    aria-valuemax={4}
                    aria-valuenow={strength}
                    aria-valuetext={strength ? t(STRENGTH[strength]) : undefined}
                  >
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="login-strength-text" aria-hidden="true">
                    {strength ? t(STRENGTH[strength]) : ''}
                  </span>
                  <span id="login-password-rule" className="login-strength-rule">
                    {t('login.passwordRule')}
                  </span>
                </span>
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
                  <button
                    type="button"
                    className="login-forgot"
                    onClick={() => switchMode('forgot')}
                  >
                    {t('login.forgot')}
                  </button>
                </div>
              )}

              <button type="submit" className="login-submit" disabled={busy} aria-busy={busy}>
                {busy && <span className="login-spinner" aria-hidden="true" />}
                <span>{submitLabel}</span>
              </button>
            </form>

            {mode === 'forgot' && (
              <div className="login-switch">
                <p>
                  <button type="button" onClick={() => switchMode('login')}>
                    ← {t('login.toSignIn')}
                  </button>
                </p>
              </div>
            )}
          </>
        )}

        <div className="login-trust">
          <img src="/login/trust.svg" alt="" width={18} height={18} aria-hidden="true" />
          <p>{t('login.trust')}</p>
        </div>
      </div>
    </main>
  )
}
