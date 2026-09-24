import { api, ApiError } from '../lib/api'
import type { CaptionLine, Episode, Playlist, Profile, Transcript, Video } from '../data/types'

/**
 * Everything the console asks of the API.
 *
 * Its own client rather than the learner app's repository: that one carries
 * takes, vocabulary, flashcards, dubs and a leaderboard, and a console will
 * never call any of it. What is here is the studio's endpoints and the two
 * session ones.
 */

export interface StudioClips {
  clips: Video[]
  total: number
}

/**
 * An upload and how far it has got.
 *
 * Almost nothing here is a stored status. Whether the words are still coming,
 * whether the clips still owe a picture, whether any of it was published are all
 * read out of the job tables when the row is asked for — see
 * `server/internal/store/uploads.go`. `uploadState` is the exception: it is the
 * one thing only the transfer itself knows.
 */
export interface Upload {
  id: string
  name: string
  title: string
  hasVideo: boolean
  bytes: number
  seconds: number
  uploadState: 'uploading' | 'stored' | 'failed'
  error: string
  published: boolean
  clips: number
  /** Clips in the library with no sound of their own: a take against one is kept
   *  and measured, but not scored. */
  clipsWithoutAudio: number
  cutsLeft: number
  cutsFailed: number
  transcript: 'none' | 'pending' | 'ready' | 'failed'
  transcribeAttempts: number
  transcribeError: string
  playlistId: string | null
  playlistTitle: string
  status: UploadStatus
  createdAt: string
}

/** The statuses an upload passes through, in order. */
export type UploadStatus =
  | 'uploading'
  | 'upload-failed'
  | 'transcribing'
  | 'transcribe-failed'
  | 'ready'
  | 'cutting'
  | 'cut-failed'
  | 'done'

export interface UploadPage {
  uploads: Upload[]
  total: number
}

export interface PlaylistPage {
  playlist: Playlist
  episodes: Episode[]
}

export interface NewClipInput {
  title: string
  source: string
  playlist: string
  categories: string[]
  timestamp: string
  durationSeconds: number
  summary: string
  captions: CaptionLine[]
  /** The upload this clip is cut from, when it is a video. Set it and the
   *  server queues the cut; leave it out and the clip is audio only. */
  sourceId?: string
  startSeconds?: number
  endSeconds?: number
}

export interface ClipPatch {
  title?: string
  playlist?: string
  categories?: string[]
  featured?: boolean
  summary?: string
  captions?: CaptionLine[]
}

export interface PlaylistPatch {
  title?: string
  description?: string
  hot?: boolean
  position?: number
}

export interface EpisodePatch {
  title?: string
  playlistId?: string
  position?: number
  published?: boolean
}

/** One person, as the console's list shows them. */
export interface Account {
  id: string
  email: string
  name: string
  isAdmin: boolean
  /** Made an admin in the console, as opposed to by ADMIN_EMAILS. */
  adminGranted: boolean
  /** In ADMIN_EMAILS: always an admin, and out of the console's reach. */
  owner: boolean
  suspendedAt: string | null
  createdAt: string
  lastSignedIn: string | null
  takes: number
  questions: number
}

export type AccountFilter = '' | 'admins' | 'suspended'

/** One day of the tutor's use, as `server/internal/store/tutorusage.go` counts it. */
export interface TutorDay {
  day: string
  questions: number
  learners: number
  failed: number
  promptTokens: number
  completionTokens: number
}

export interface TutorLearner {
  userId: string
  email: string
  name: string
  questions: number
  promptTokens: number
  completionTokens: number
  lastAsked: string
}

export interface TutorUsage {
  days: TutorDay[]
  learners: TutorLearner[]
  model: string
  limit: { questions: number; windowMinutes: number }
}

export const repository = {
  async me(): Promise<Profile | null> {
    const { user } = await api.get<{ user: Profile | null }>('/auth/me')
    return user
  },

  logout() {
    return api.send<void>('POST', '/auth/logout', {})
  },

  /** The clip manager, paged and searched on the server. There is no endpoint
   *  that hands out the whole library, and this screen is the reason there does
   *  not need to be one. */
  studioClips(query: string, limit: number, offset: number) {
    const params = new URLSearchParams({ q: query, limit: String(limit), offset: String(offset) })
    return api.get<StudioClips>(`/api/admin/clips?${params.toString()}`)
  },

  async nextClipNumber(playlist: string) {
    const { next } = await api.get<{ next: number }>(
      `/api/admin/clips/next-number?playlist=${encodeURIComponent(playlist)}`,
    )
    return next
  },

  createClips(clips: NewClipInput[]) {
    return api.send<Video[]>('POST', '/api/admin/clips', { clips })
  },

  async uploadClipAudio(clipId: string, audio: Blob) {
    await api.upload<{ ok: boolean }>('PUT', `/api/admin/clips/${clipId}/audio`, audio)
  },

  updateClip(clipId: string, patch: ClipPatch) {
    return api.send<Video>('PATCH', `/api/admin/clips/${clipId}`, patch)
  },

  deleteClip(clipId: string) {
    return api.del(`/api/admin/clips/${clipId}`)
  },

  /**
   * Announces a recording before sending it, and returns the id the clips will
   * reference.
   *
   * Two calls rather than one, and this is the reason: the row exists from here
   * on, so a transfer still running has something to show in the history and one
   * that dies leaves a reason behind instead of nothing at all.
   */
  async createUpload(file: File, seconds: number) {
    const { id } = await api.send<{ id: string }>('POST', '/api/admin/uploads', {
      name: file.name,
      contentType: file.type || 'application/octet-stream',
      bytes: file.size,
      seconds,
    })
    return id
  },

  /** Sends the recording itself. The server queues transcription once it lands. */
  async sendUpload(id: string, file: File) {
    await api.upload<{ ok: boolean }>('PUT', `/api/admin/uploads/${id}/file`, file)
  },

  /** The history: every recording sent, newest first, with how far each has got. */
  uploads(query: string, state: string, limit: number, offset: number) {
    const params = new URLSearchParams({
      q: query,
      state,
      limit: String(limit),
      offset: String(offset),
    })
    return api.get<UploadPage>(`/api/admin/uploads?${params.toString()}`)
  },

  upload(id: string) {
    return api.get<{ upload: Upload; clips: Video[] }>(`/api/admin/uploads/${id}`)
  },

  /** Everybody who has signed in, newest first, a page at a time. */
  accounts(query: string, filter: AccountFilter, limit: number, offset: number) {
    const params = new URLSearchParams({ q: query, filter, limit: String(limit), offset: String(offset) })
    return api.get<{ users: Account[]; total: number }>(`/api/admin/users?${params.toString()}`)
  },

  /** Gives or takes admin rights, or suspends or restores an account. */
  setAccess(id: string, change: { admin?: boolean; suspended?: boolean }) {
    return api.send<Account>('PATCH', `/api/admin/users/${id}`, change)
  },

  /** What the tutor has cost over the last `days` days: by day and by learner. */
  tutorUsage(days: number) {
    return api.get<TutorUsage>(`/api/admin/tutor/usage?days=${days}`)
  },

  /** Puts the work that gave up back on the queue. Answers with how much, so
   *  "nothing to retry" can be said rather than implied. */
  retryUpload(id: string) {
    return api.send<{ transcribe: number; cuts: number }>(
      'POST',
      `/api/admin/uploads/${id}/retry`,
      {},
    )
  },

  /** The words Whisper found in a recording, or word that they are still coming. */
  sourceTranscript(sourceId: string) {
    return api.get<Transcript>(`/api/admin/uploads/${sourceId}/transcript`)
  },

  listPlaylists() {
    return api.get<Playlist[]>('/api/playlists')
  },

  playlist(slug: string) {
    return api.get<PlaylistPage>(`/api/playlists/${encodeURIComponent(slug)}`)
  },

  updatePlaylist(id: string, patch: PlaylistPatch) {
    return api.send<Playlist>('PATCH', `/api/admin/playlists/${id}`, patch)
  },

  deletePlaylist(id: string) {
    return api.del(`/api/admin/playlists/${id}`)
  },

  updateEpisode(id: string, patch: EpisodePatch) {
    return api.send<Episode>('PATCH', `/api/admin/episodes/${id}`, patch)
  },

  deleteEpisode(id: string) {
    return api.del(`/api/admin/episodes/${id}`)
  },
}

export { ApiError }
