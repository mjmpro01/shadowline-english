import { Navigate, useSearchParams } from 'react-router-dom'
import { LoadFailure, Loading } from '../components/LoadState'
import { useT } from '../i18n'
import type { MessageKey } from '../i18n/en'
import { loginURL } from '../lib/api'
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

export function LoginScreen() {
  const { state, signedIn } = useApp()
  const t = useT()
  const [params] = useSearchParams()

  if (state === 'loading') return <Loading />
  if (state === 'error') return <LoadFailure />
  if (signedIn) return <Navigate to="/dashboard" replace />

  // An unknown code still gets a message: the alternative is a silent redirect
  // back to a login screen that looks like nothing happened.
  const code = params.get('error')
  const message = code ? t(LOGIN_ERRORS[code] ?? 'login.error.unknown') : null

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

        {/*
          A link rather than a button with a handler: signing in is a navigation
          out of the app to Google and back, and fetch cannot follow that.
        */}
        <a className="btn btn-secondary btn-block" href={loginURL()}>
          {message ? t('login.tryAgain') : t('login.google')}
        </a>

        <div className="card-meta" style={{ textAlign: 'center' }}>
          {t('login.only')}
        </div>
      </div>
    </div>
  )
}
