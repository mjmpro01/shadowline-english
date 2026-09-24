import { createContext, useContext } from 'react'
import type { LeaderboardRow } from '../repository'
import type { AppData, Take, VocabStatus } from '../data/types'

export interface VideoStats {
  takes: Take[]
  attempts: number
  /** Latest scored take, or null when nothing has been scored yet. */
  lastScore: number | null
  sparkline: number[]
}

/**
 * How the app is doing at reaching the server.
 *
 * `error` is a state rather than a thrown exception because the whole app
 * depends on this load: without it every screen renders empty, and the browser
 * version simply showed a blank page forever when the load failed.
 */
export type LoadState = 'loading' | 'ready' | 'error'

export interface Store {
  data: AppData
  state: LoadState
  /** What went wrong, when state is 'error'. */
  error: string | null
  /** Signed in, which the server decides. */
  signedIn: boolean
  isAdmin: boolean
  reload: () => Promise<void>
  logout: () => Promise<void>
  /** Fetches clips the app does not hold yet. `data.videos` is a cache of the
   *  clips screens have asked for, not the library. */
  ensureClips: (ids: string[]) => Promise<void>
  /** Whether a clip is known not to exist, as opposed to not fetched yet. */
  clipMissing: (id: string) => boolean
  addTake: (videoId: string, audio: Blob) => Promise<Take>
  /** Throws a recording away. Nothing else keeps a copy of it. */
  deleteTake: (id: string) => Promise<void>
  toggleVocabWord: (
    raw: string,
    videoId: string | null,
  ) => Promise<{ word: string; status: 'added' | 'removed' }>
  setVocabStatus: (id: string, status: VocabStatus) => Promise<void>
  reviewWord: (id: string, status: VocabStatus) => Promise<void>
  updateProfile: (name: string, avatar: Blob | null) => Promise<void>
  statsFor: (videoId: string) => VideoStats
  leaderboard: LeaderboardRow[]
}

export const AppContext = createContext<Store | null>(null)

export function useApp(): Store {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
