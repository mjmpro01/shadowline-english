import { Navigate } from 'react-router-dom'
import { LoadFailure, Loading } from '../components/LoadState'
import { loginURL } from '../lib/api'
import { useApp } from '../store/context'

export function LoginScreen() {
  const { state, signedIn } = useApp()

  if (state === 'loading') return <Loading />
  if (state === 'error') return <LoadFailure />
  if (signedIn) return <Navigate to="/dashboard" replace />

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

        {/*
          A link rather than a button with a handler: signing in is a navigation
          out of the app to Google and back, and fetch cannot follow that.
        */}
        <a className="btn btn-secondary btn-block" href={loginURL()}>
          Continue with Google
        </a>

        <div className="card-meta" style={{ textAlign: 'center' }}>
          Google is the only way in — there is no password to lose.
        </div>
      </div>
    </div>
  )
}
