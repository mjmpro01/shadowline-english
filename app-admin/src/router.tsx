import { Navigate, createBrowserRouter } from 'react-router-dom'
import { ConsoleShell } from './components/ConsoleShell'
import { Gate } from './components/Gate'
import { Clips } from './pages/Clips'
import { Cut } from './pages/Cut'
import { Series } from './pages/Series'
import { Uploads } from './pages/Uploads'

// basename matches vite's `base`: the console is served under /admin/ on the
// same origin as the learner app, so every route here is really /admin/…
export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: (
        <Gate>
          <ConsoleShell />
        </Gate>
      ),
      children: [
        { index: true, element: <Navigate to="/cut" replace /> },
        { path: 'cut', element: <Cut /> },
        { path: 'clips', element: <Clips /> },
        { path: 'series', element: <Series /> },
        { path: 'uploads', element: <Uploads /> },
        { path: '*', element: <Navigate to="/cut" replace /> },
      ],
    },
  ],
  { basename: '/admin' },
)
