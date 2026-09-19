import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './styles/tokens.css'
import './styles/components.css'
import './styles/app.css'
import { router } from './router'
import { I18nProvider } from './i18n/I18nProvider'
import { AppProvider } from './store/AppStore'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>
    </I18nProvider>
  </StrictMode>,
)
