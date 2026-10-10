import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { RequireAuth } from './components/RequireAuth'
import { AnalysisScreen } from './screens/AnalysisScreen'
import { DashboardScreen } from './screens/DashboardScreen'
import { DubScreen } from './screens/DubScreen'
import { EpisodeScreen } from './screens/EpisodeScreen'
import { FlashcardsScreen } from './screens/FlashcardsScreen'
import { GuideScreen } from './screens/GuideScreen'
import { HomeScreen } from './screens/HomeScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { LegalScreen } from './screens/LegalScreen'
import { LoginScreen } from './screens/LoginScreen'
import { PracticeScreen } from './screens/PracticeScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { SeriesScreen } from './screens/SeriesScreen'
import { VocabularyScreen } from './screens/VocabularyScreen'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginScreen /> },
  // Public, outside RequireAuth: Google's consent screen links to both.
  { path: '/privacy', element: <LegalScreen kind="privacy" /> },
  { path: '/terms', element: <LegalScreen kind="terms" /> },
  // The home page is public — Google's OAuth verification requires one that
  // explains the app without a login. A signed-in visitor is sent on to the
  // dashboard from inside it.
  { path: '/', element: <HomeScreen /> },
  {
    // Pathless: everything below needs an account, and shares the shell.
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { path: 'dashboard', element: <DashboardScreen /> },
      { path: 'library', element: <LibraryScreen /> },
      // The library is a tree: a series, an episode, a clip. Before the
      // :videoId route in the file for readability; each wins on its own
      // anyway, having a static segment where that one has a parameter.
      { path: 'library/s/:slug', element: <SeriesScreen /> },
      { path: 'library/e/:episodeId', element: <EpisodeScreen /> },
      { path: 'library/:videoId', element: <AnalysisScreen /> },
      { path: 'library/:videoId/practice', element: <PracticeScreen /> },
      { path: 'library/:videoId/dub', element: <DubScreen /> },
      { path: 'vocabulary', element: <VocabularyScreen /> },
      { path: 'vocabulary/practice', element: <FlashcardsScreen /> },
      { path: 'progress', element: <ProgressScreen /> },
      { path: 'guide', element: <GuideScreen /> },
      { path: 'profile', element: <ProfileScreen /> },
      { path: '*', element: <Navigate to="/library" replace /> },
    ],
  },
])
