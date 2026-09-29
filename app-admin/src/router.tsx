import { Navigate, createBrowserRouter } from 'react-router-dom'
import { ConsoleShell } from './components/ConsoleShell'
import { Gate } from './components/Gate'
import { PageError } from './components/PageError'
import { Clips } from './pages/Clips'
import { Cut } from './pages/Cut'
import { Series } from './pages/Series'
import { Banners } from './pages/Banners'
import { Tutor } from './pages/Tutor'
import { Users } from './pages/Users'
import { Uploads } from './pages/Uploads'
import { Login } from './pages/Login'
import { System } from './pages/System'

// basename matches vite's `base`: the console is served under /admin/ on the
// same origin as the learner app, so every route here is really /admin/…
export const router = createBrowserRouter(
  [
    // Outside the gate: it is where the gate sends somebody signed out.
    { path: '/login', element: <Login /> },
    {
      path: '/',
      element: (
        <Gate>
          <ConsoleShell />
        </Gate>
      ),
      children: [
        {
          // A page that throws shows inside the shell, menu and all.
          errorElement: <PageError />,
          children: [
            { index: true, element: <Navigate to="/cut" replace /> },
            { path: 'cut', element: <Cut /> },
            { path: 'clips', element: <Clips /> },
            { path: 'series', element: <Series /> },
            { path: 'uploads', element: <Uploads /> },
            { path: 'tutor', element: <Tutor /> },
            { path: 'users', element: <Users /> },
            { path: 'banners', element: <Banners /> },
            { path: 'system', element: <System /> },
            { path: '*', element: <Navigate to="/cut" replace /> },
          ],
        },
      ],
    },
  ],
  { basename: '/admin' },
)
