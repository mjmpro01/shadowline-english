import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { AdminScreen } from '../screens/AdminScreen'
import { useApp } from '../store/context'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, ready } = useApp()
  if (!ready) return null
  if (!data.loggedIn) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Admin is a local flag today; the real check belongs on the server. */
export function RequireAdmin() {
  const { data, ready } = useApp()
  if (!ready) return null
  if (!data.isAdmin) return <Navigate to="/library" replace />
  return <AdminScreen />
}
