import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Profile } from './data/types'
import { repository } from './repository'

/**
 * Who is signed in, asked once.
 *
 * The console has no store: there is no library to hold and no learner records
 * to load. The only thing every screen needs is the account, and the studio's
 * screens fetch what they show.
 */

type Session =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  // Null is signed out, which the gate turns into a trip to the login screen.
  | { state: 'ready'; user: Profile | null }

const SessionContext = createContext<Session>({ state: 'loading' })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ state: 'loading' })

  useEffect(() => {
    repository
      .me()
      .then((user) => setSession({ state: 'ready', user }))
      .catch((err: unknown) => {
        setSession({
          state: 'error',
          message: err instanceof Error ? err.message : 'Could not reach the server.',
        })
      })
  }, [])

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  return useContext(SessionContext)
}

/** Where to send somebody who is not signed in. The learner app owns the login
 *  screen, and it lives at the root of the same origin. */
export const LOGIN_URL = '/login'
