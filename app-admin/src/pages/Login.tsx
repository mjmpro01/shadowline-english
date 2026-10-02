import { useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import type { Profile } from '../data/types'
import { useT } from '../i18n'
import type { MessageKey } from '../i18n/en'
import { ApiError, api } from '../lib/api'
import { repository } from '../repository'
import { useSession } from '../session'

/** The server's ?error= codes, as the words to show. Same codes as the learner
 *  app's login screen: the server sends a failed login back to whichever
 *  screen it started from. */
const LOGIN_ERRORS: Record<string, MessageKey> = {
  expired: 'login.error.expired',
  browser: 'login.error.browser',
  cancelled: 'login.error.cancelled',
  failed: 'login.error.failed',
  server: 'login.error.server',
  suspended: 'login.error.suspended',
  unverified: 'login.error.unverified',
}

/** Where the console starts once somebody is in. A full navigation rather than
 *  a route change, so the session is asked for again from the start. */
const CONSOLE_HOME = '/admin/'

/**
 * The console's own way in.
 *
 * Signing out of the console used to land on the learner app's login screen,
 * and signing in there landed on the learner's dashboard: an admin had to find
 * their way back each time. This is the same two ways in — Google, or email and
 * password — started from here, so both come back here. The server remembers
 * where a Google login began (`?from=admin`) and returns to it, success or
 * failure.
 */
export function Login() {
  const t = useT()
  const session = useSession()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Signed in just now with an account that cannot use the console.
  const [notAdmin, setNotAdmin] = useState<Profile | null>(null)

  if (session.state === 'ready' && session.user?.isAdmin) return <Navigate to="/" replace />

  const signedInAs = notAdmin ?? (session.state === 'ready' ? session.user : null)
  const code = params.get('error')
  const message = error ?? (code ? t(LOGIN_ERRORS[code] ?? 'login.error.unknown') : null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const { user } = await api.send<{ user: Profile }>('POST', '/auth/login', { email, password })
      if (user.isAdmin) {
        window.location.href = CONSOLE_HOME
        return
      }
      setNotAdmin(user)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('login.error.server'))
    } finally {
      setBusy(false)
    }
  }

  const switchAccount = async () => {
    await repository.logout().catch(() => undefined)
    window.location.href = '/admin/login'
  }

  return (
    <main className="console-login">
      <div className="console-login-card">
        <img className="console-login-crest" src="/login/crest.webp" alt="" width={84} height={84} />
        <h1 className="visually-hidden">{t('login.heading')}</h1>
        <div className="menu-sign console-login-sign" aria-hidden="true">
          <span className="menu-sign-title">SHADOWLINE</span>
          <span className="menu-sign-tagline">{t('nav.tagline')}</span>
        </div>
        <p className="console-login-lead">{t('login.lead')}</p>

        {message && (
          <div className="console-login-alert" role="alert">
            {message}
          </div>
        )}

        {signedInAs && !signedInAs.isAdmin ? (
          <div className="stack gap-3">
            <div className="console-login-alert" role="alert">
              {t('login.notAdmin', signedInAs.email)}
            </div>
            <button type="button" className="btn btn-primary btn-block" onClick={() => void switchAccount()}>
              {t('login.useAnother')}
            </button>
            <a className="btn btn-secondary btn-block" href="/dashboard">
              {t('nav.back')}
            </a>
          </div>
        ) : (
          <>
            <a className="btn btn-secondary btn-block console-login-google" href="/auth/google/start?from=admin">
              <span className="console-login-g" aria-hidden="true">
                G
              </span>
              {code ? t('login.tryAgain') : t('login.google')}
            </a>

            <div className="console-login-or">
              <span />
              {t('login.or')}
              <span />
            </div>

            <form className="stack gap-3" onSubmit={(e) => void submit(e)}>
              <label className="stack gap-1">
                <span className="field-label">{t('login.email')}</span>
                <input
                  id="login-email"
                  className="input"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="stack gap-1">
                <span className="field-label">{t('login.password')}</span>
                <input
                  id="login-password"
                  className="input"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? t('login.signingIn') : t('login.signIn')}
              </button>
            </form>

            <div className="console-login-foot">
              {/* Resetting a password is the learner app's screen: it is the
                  same account, and one reset form is enough. */}
              <a href="/login">{t('login.forgot')}</a>
              <a href="/dashboard">{t('nav.back')}</a>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
