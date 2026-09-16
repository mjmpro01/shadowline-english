import { createContext, useContext } from 'react'
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

export interface Store {
  data: AppData
  ready: boolean
  login: () => void
  logout: () => void
  setAdmin: (isAdmin: boolean) => void
  addClips: (clips: NewClip[]) => Promise<void>
  updateClip: (id: string, edit: ClipEdit) => void
  deleteClip: (id: string) => void
  addTake: (videoId: string, audio: Blob | null) => Promise<Take>
  scoreTake: (takeId: string) => Promise<void>
  toggleVocabWord: (raw: string, videoId: string | null) => { word: string; status: 'added' | 'removed' | 'known' }
  setVocabStatus: (id: string, status: VocabStatus) => void
  updateProfile: (name: string, email: string, avatar: Blob | null) => Promise<void>
  statsFor: (videoId: string) => VideoStats
}

export const AppContext = createContext<Store | null>(null)

export function useApp(): Store {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
