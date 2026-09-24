import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './styles/tokens.css'
import './styles/components.css'
import './styles/app.css'
import { router } from './router'
import { I18nProvider } from './i18n/I18nProvider'
import { AppProvider } from './store/AppStore'
import { startTheme } from './lib/theme'

startTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>
    </I18nProvider>
  </StrictMode>,
)

// The service worker is what makes the app installable, and it only gets in
// the way in development: Vite serves modules the worker would happily cache
// and then hand back after a hot reload. `sw.js` says what it does and, more
// to the point, what it does not.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
      // Not being installable is not a reason for anything to look broken.
      console.warn('could not register the service worker', err)
    })
  })
}
