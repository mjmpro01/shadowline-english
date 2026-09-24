import { useEffect, type ReactNode } from 'react'
import { LOGIN_URL, useSession } from '../session'

/**
 * Who gets in.
 *
 * A convenience, not the rule: every endpoint under /api/admin re-checks on the
 * server, so getting past this reaches nothing. What it is for is not showing a
 * learner a console they cannot use, and not leaving somebody signed out staring
 * at an empty page wondering what broke.
 */
export function Gate({ children }: { children: ReactNode }) {
  const session = useSession()
  const signedOut = session.state === 'ready' && session.user === null

  // In an effect rather than during render: leaving the page is the effect of
  // rendering "taking you to the login screen", not part of working out what to
  // draw. A full navigation and not a router redirect, because the login screen
  // belongs to the learner app, which is a different build at the root.
  useEffect(() => {
    if (signedOut) window.location.href = LOGIN_URL
  }, [signedOut])

  if (session.state === 'loading') {
    return <div className="console-notice">Checking who you are…</div>
  }

  if (session.state === 'error') {
    return (
      <div className="console-notice">
        <h1>The server did not answer</h1>
        <p>{session.message}</p>
      </div>
    )
  }

  if (!session.user) {
    return <div className="console-notice">Taking you to the login screen…</div>
  }

  if (!session.user.isAdmin) {
    return (
      <div className="console-notice">
        <h1>Not for this account</h1>
        <p>
          The console is for the people who run the library. {session.user.email} is signed in and
          is not one of them.
        </p>
        <p>
          <a href="/dashboard">Back to the app</a>
        </p>
      </div>
    )
  }

  return <>{children}</>
}
