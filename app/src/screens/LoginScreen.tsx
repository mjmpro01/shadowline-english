import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useApp } from '../store/context'

export function LoginScreen() {
  const [showEmailForm, setShowEmailForm] = useState(false)
  const { data, ready, login } = useApp()
  const navigate = useNavigate()

  if (ready && data.loggedIn) return <Navigate to="/dashboard" replace />

  const signIn = (e?: FormEvent) => {
    e?.preventDefault()
    login()
    navigate('/dashboard', { replace: true })
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
          <div style={{ fontSize: 14, opacity: 0.65 }}>pronunciation &amp; rhythm practice, for yourself</div>
        </div>

        <button type="button" className="btn btn-secondary btn-block" onClick={() => signIn()}>
          Continue with Google
        </button>

        <div className="row gap-3" style={{ width: '100%' }}>
          <div className="divider" style={{ flex: 1 }} />
          <div style={{ fontSize: 12, opacity: 0.5 }}>or</div>
          <div className="divider" style={{ flex: 1 }} />
        </div>

        {!showEmailForm ? (
          <button type="button" className="btn btn-ghost" onClick={() => setShowEmailForm(true)}>
            Use email
          </button>
        ) : (
          <form className="stack gap-3" style={{ width: '100%' }} onSubmit={signIn}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" className="input" placeholder="you@example.com" required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" className="input" placeholder="••••••••" required />
            </div>
            <button type="submit" className="btn btn-primary btn-block">
              Sign in
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
