import { createContext, useContext } from 'react'
import type { LeaderboardRow } from '../repository'
import type { AppData, Take, Video, VocabStatus } from '../data/types'

export interface NewClip {
  /** What the library shows; falls back to the line when left empty. */
  title: string
  line: string
  ipa: string
  source: string
  playlist: string
  categories: string[]
  start: number
  end: number
  audio: Blob
}

/** The parts of a published clip an admin can still change. */
export type ClipEdit = Partial<Pick<Video, 'title' | 'playlist' | 'categories' | 'featured'>> & {
  line?: string
  ipa?: string
}

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
  addClips: (clips: NewClip[]) => Promise<void>
  updateClip: (id: string, edit: ClipEdit) => Promise<void>
  deleteClip: (id: string) => Promise<void>
  addTake: (videoId: string, audio: Blob) => Promise<Take>
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
