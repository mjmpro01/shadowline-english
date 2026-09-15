import { createContext, useContext } from 'react'
import type { AppData, Take, Video, VocabStatus } from '../data/types'

export interface VideoStats {
  takes: Take[]
  attempts: number
  lastScore: number
  sparkline: number[]
}

export interface Store {
  data: AppData
  ready: boolean
  login: () => void
  logout: () => void
  importVideo: (url: string) => Video
  addTake: (videoId: string, audio: Blob | null) => Take
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
