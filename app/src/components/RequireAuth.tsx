import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { AdminScreen } from '../screens/AdminScreen'
import { useApp } from '../store/context'
import { LoadFailure, Loading } from './LoadState'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { state, signedIn } = useApp()
  if (state === 'loading') return <Loading />
  if (state === 'error') return <LoadFailure />
  if (!signedIn) return <Navigate to="/login" replace />
  return <>{children}</>
}

/**
 * Hides the studio from everyone the server did not mark as an admin. This is
 * a convenience, not the rule: every admin endpoint re-checks on the server, so
 * getting past this route reaches nothing.
 */
export function RequireAdmin() {
  const { state, isAdmin } = useApp()
  if (state === 'loading') return <Loading />
  if (state === 'error') return <LoadFailure />
  if (!isAdmin) return <Navigate to="/library" replace />
  return <AdminScreen />
}
