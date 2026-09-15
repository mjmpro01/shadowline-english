import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '../store/context'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, ready } = useApp()
  if (!ready) return null
  if (!data.loggedIn) return <Navigate to="/login" replace />
  return <>{children}</>
}
