import { Navigate, useSearchParams } from 'react-router-dom'
import { LoadFailure, Loading } from '../components/LoadState'
import { loginURL } from '../lib/api'
import { useApp } from '../store/context'

/**
 * What the server's ?error= codes mean, in words a learner can act on.
 *
 * The wording lives here rather than in the API because the API answers a
 * browser navigation, not a fetch: it can only hand back a code, and this is
 * the one place that knows how the app talks to the person reading it.
 */
const LOGIN_ERRORS: Record<string, string> = {
  expired: 'That sign-in link expired. Try again.',
  browser: 'That sign-in started in another browser or tab. Try again here.',
  cancelled: 'Sign-in was cancelled — nothing was shared with Shadowline.',
  failed: 'Google could not complete the sign-in. Try again.',
  server: 'Something went wrong on our side. Try again in a moment.',
}

const LOGIN_ERROR_FALLBACK = 'Sign-in did not complete. Try again.'

export function LoginScreen() {
  const { state, signedIn } = useApp()
  const [params] = useSearchParams()

  if (state === 'loading') return <Loading />
  if (state === 'error') return <LoadFailure />
  if (signedIn) return <Navigate to="/dashboard" replace />

  // An unknown code still gets a message: the alternative is a silent redirect
  // back to a login screen that looks like nothing happened.
  const code = params.get('error')
  const message = code ? (LOGIN_ERRORS[code] ?? LOGIN_ERROR_FALLBACK) : null

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
          <div style={{ fontSize: 14, opacity: 0.65 }}>pronunciation &amp; rhythm practice, for yourself</div>
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
          {message ? 'Try Google again' : 'Continue with Google'}
        </a>

        <div className="card-meta" style={{ textAlign: 'center' }}>
          Google is the only way in — there is no password to lose.
        </div>
      </div>
    </div>
  )
}
