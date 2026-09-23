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

/**
 * How far publishing has got, for the screen to say so.
 *
 * Publishing a long recording is hundreds of requests and hundreds of megabytes
 * of audio. It used to be one unlabelled "Saving…" for all of it, which is
 * indistinguishable from a studio that has hung.
 */
export interface PublishProgress {
  /** 'clips' while the rows are being written, 'audio' while their sound goes up. */
  stage: 'clips' | 'audio'
  done: number
  total: number
}

export interface PublishResult {
  /** Clips that reached the library. */
  published: number
  /**
   * Clips that are in the library with no sound of their own.
   *
   * Not a thrown error: the clips exist and are worth having, and a take
   * recorded against one is kept and measured, only not scored. Saying nothing
   * would be worse — this is what the studio reports so the admin can put the
   * audio back rather than discovering it from a learner.
   */
  withoutAudio: number
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
  /** Publishes a batch. `sourceId` is the recording the studio already
   *  uploaded: pass it and the server cuts each clip's video out of it in the
   *  background. */
  addClips: (
    clips: NewClip[],
    sourceId?: string | null,
    onProgress?: (at: PublishProgress) => void,
  ) => Promise<PublishResult>
  updateClip: (id: string, edit: ClipEdit) => Promise<void>
  deleteClip: (id: string) => Promise<void>
  /** Forgets the clips an episode the studio deleted took with it. */
  forgetEpisode: (episodeId: string) => void
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
