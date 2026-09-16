import { createContext, useContext } from 'react'
import type { AppData, Take, VocabStatus } from '../data/types'

export interface NewClip {
  line: string
  ipa: string
  source: string
  start: number
  end: number
  audio: Blob
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
