import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { RequireAdmin, RequireAuth } from './components/RequireAuth'
import { AnalysisScreen } from './screens/AnalysisScreen'
import { DashboardScreen } from './screens/DashboardScreen'
import { DubScreen } from './screens/DubScreen'
import { FlashcardsScreen } from './screens/FlashcardsScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { LoginScreen } from './screens/LoginScreen'
import { PlaylistScreen } from './screens/PlaylistScreen'
import { PracticeScreen } from './screens/PracticeScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { VocabularyScreen } from './screens/VocabularyScreen'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginScreen /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardScreen /> },
      { path: 'library', element: <LibraryScreen /> },
      // Before the :videoId route in the file for readability; it wins on its
      // own anyway, having a static segment where that one has a parameter.
      { path: 'library/playlist/:name', element: <PlaylistScreen /> },
      { path: 'library/:videoId', element: <AnalysisScreen /> },
      { path: 'library/:videoId/practice', element: <PracticeScreen /> },
      { path: 'library/:videoId/dub', element: <DubScreen /> },
      { path: 'vocabulary', element: <VocabularyScreen /> },
      { path: 'vocabulary/practice', element: <FlashcardsScreen /> },
      { path: 'progress', element: <ProgressScreen /> },
      { path: 'profile', element: <ProfileScreen /> },
      { path: 'admin', element: <RequireAdmin /> },
      { path: '*', element: <Navigate to="/library" replace /> },
    ],
  },
])
