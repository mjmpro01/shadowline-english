import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './styles/tokens.css'
import './styles/components.css'
import './styles/console.css'
import { router } from './router'
import { I18nProvider } from './i18n/I18nProvider'
import { SessionProvider } from './session'

// No service worker. The learner app registers one because it is installable on
// a phone; a console is opened at a desk, and a cache that hands back yesterday's
// build is the last thing somebody publishing a library needs.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </I18nProvider>
  </StrictMode>,
)
