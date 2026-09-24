import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '../store/context'
import { LoadFailure, Loading } from './LoadState'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { state, signedIn } = useApp()
  if (state === 'loading') return <Loading />
  if (state === 'error') return <LoadFailure />
  if (!signedIn) return <Navigate to="/login" replace />
  return <>{children}</>
}

