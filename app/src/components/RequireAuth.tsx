import { useEffect, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { isLocale, storedLocale, useI18n } from '../i18n'
import { NativeLanguageScreen } from '../screens/NativeLanguageScreen'
import { useApp } from '../store/context'
import { LoadFailure, Loading } from './LoadState'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { state, signedIn, data } = useApp()
  const { locale, setLocale } = useI18n()
  const native = data.profile?.nativeLanguage

  // A browser that has never been told a language takes the account's: the
  // learner answered once, on whichever device they signed in on first, and
  // should not land on a new phone in a language they cannot read.
  useEffect(() => {
    if (isLocale(native) && native !== locale && storedLocale() === null) setLocale(native)
  }, [native, locale, setLocale])

  if (state === 'loading') return <Loading />
  if (state === 'error') return <LoadFailure />
  if (!signedIn) return <Navigate to="/login" replace />
  // Asked before anything else is shown, and only until it is answered.
  if (!native) return <NativeLanguageScreen />
  return <>{children}</>
}
