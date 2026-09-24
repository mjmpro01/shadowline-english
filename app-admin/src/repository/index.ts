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

  /** Stores the recording a batch is cut from, once, and returns its id. */
  async uploadSource(file: Blob, name: string) {
    const { id } = await api.upload<{ id: string }>(
      'POST',
      `/api/admin/sources?name=${encodeURIComponent(name)}`,
      file,
    )
    return id
  },

  /** The words Whisper found in a source, or word that they are still coming. */
  sourceTranscript(sourceId: string) {
    return api.get<Transcript>(`/api/admin/sources/${sourceId}/transcript`)
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
