import { Navigate, createBrowserRouter, useLocation, useParams } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { RequireAuth } from './components/RequireAuth'
import { AnalysisScreen } from './screens/AnalysisScreen'
import { ArenaScreen } from './screens/ArenaScreen'
import { DashboardScreen } from './screens/DashboardScreen'
import { DialogueScreen } from './screens/DialogueScreen'
import { DialoguesScreen } from './screens/DialoguesScreen'
import { DictationEpisodeScreen } from './screens/DictationEpisodeScreen'
import { DictationHomeScreen } from './screens/DictationHomeScreen'
import { DictationScreen } from './screens/DictationScreen'
import { DubScreen } from './screens/DubScreen'
import { EpisodeScreen } from './screens/EpisodeScreen'
import { FlashcardsScreen } from './screens/FlashcardsScreen'
import { GuideScreen } from './screens/GuideScreen'
import { HomeScreen } from './screens/HomeScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { LegalScreen } from './screens/LegalScreen'
import { LoginScreen } from './screens/LoginScreen'
import { PhrasebookScreen } from './screens/PhrasebookScreen'
import { PracticeScreen } from './screens/PracticeScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { SeriesScreen } from './screens/SeriesScreen'
import { ShelfScreen } from './screens/ShelfScreen'
import { TrainScreen } from './screens/TrainScreen'
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
      { path: 'library/shelf/:slug', element: <ShelfScreen /> },
      { path: 'library/e/:episodeId', element: <EpisodeScreen /> },
      // Where a dictation first lived, before it had a tab of its own.
      { path: 'library/e/:episodeId/dictation/:clipId', element: <ToDictation /> },
      { path: 'library/:videoId', element: <AnalysisScreen /> },
      { path: 'library/:videoId/practice', element: <PracticeScreen /> },
      { path: 'library/:videoId/dub', element: <DubScreen /> },
      { path: 'dictation', element: <DictationHomeScreen /> },
      { path: 'dictation/e/:episodeId', element: <DictationEpisodeScreen /> },
      { path: 'dictation/e/:episodeId/:clipId', element: <DictationScreen /> },
      { path: 'train', element: <TrainScreen /> },
      { path: 'dialogues', element: <DialoguesScreen /> },
      // Under dialogues, so the menu stays lit on the plank it is reached from.
      { path: 'dialogues/phrasebook', element: <PhrasebookScreen /> },
      { path: 'dialogues/:ref', element: <DialogueScreen /> },
      { path: 'arena', element: <ArenaScreen /> },
      { path: 'vocabulary', element: <VocabularyScreen /> },
      { path: 'vocabulary/practice', element: <FlashcardsScreen /> },
      { path: 'progress', element: <ProgressScreen /> },
      { path: 'guide', element: <GuideScreen /> },
      { path: 'profile', element: <ProfileScreen /> },
      { path: '*', element: <Navigate to="/library" replace /> },
    ],
  },
])

function ToDictation() {
  const { episodeId, clipId } = useParams()
  const { search } = useLocation()
  return <Navigate to={`/dictation/e/${episodeId ?? ''}/${clipId ?? ''}${search}`} replace />
}
