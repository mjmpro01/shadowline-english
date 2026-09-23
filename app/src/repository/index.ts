import { api, ApiError } from '../lib/api'
import type {
  CaptionLine,
  Dub,
  Episode,
  Gloss,
  Playlist,
  Profile,
  SearchResults,
  Take,
  Transcript,
  Video,
  VocabStatus,
  VocabWord,
} from '../data/types'

/**
 * The app's data seam. Records live on the server now; this is the only module
 * that knows the shape of the API, and screens talk to the store rather than to
 * either.
 *
 * Writes are per record rather than per collection. The localStorage version
 * saved whole arrays — `saveVideos(videos[])` — which was fine for one browser
 * and would have had two devices overwriting each other's work.
 */
export interface Repository {
  me(): Promise<Profile | null>
  logout(): Promise<void>

  /** The library's top level: every series, with its counts and its badge. */
  listPlaylists(): Promise<Playlist[]>
  /** One series and its episodes, together: there is no moment worth rendering
   *  where the screen has the heading and not the list. */
  playlist(slug: string): Promise<PlaylistPage>
  /** One episode, its clips, and the series it is in — the last so the screen
   *  can offer the way back up by name without a second round trip. */
  episode(id: string): Promise<EpisodePage>
  /** One search across all three levels. */
  searchLibrary(query: string): Promise<SearchResults>
  /** Renames a series, describes it, or marks it hot. Admin only. */
  updatePlaylist(id: string, patch: PlaylistPatch): Promise<Playlist>
  /** Renames an episode, moves it to another series, or reorders it. */
  updateEpisode(id: string, patch: EpisodePatch): Promise<Episode>
  /** Removes an episode, its clips and the recording they were cut from. */
  deleteEpisode(id: string): Promise<void>
  /** Removes a series. The server refuses one that still has clips in it. */
  deletePlaylist(id: string): Promise<void>

  /** The clips a screen already knows it wants. There is no endpoint for the
   *  whole library any more: it was 7.4MB at sign-in, most of it signed poster
   *  URLs for clips nobody was going to open. */
  clipsByIds(ids: string[]): Promise<Video[]>
  /** One clip, or null when it is not there any more. */
  clip(id: string): Promise<Video | null>
  /** What the dashboard offers; an admin picks these. */
  featuredClips(): Promise<Video[]>
  /** What to practise next — a clip never tried, or the one that went worst.
   *  A question about the whole library, so the server answers it. */
  nextUp(): Promise<Video | null>
  /** The counts and the tags the app used to work out by counting a library
   *  it had been sent. */
  librarySummary(): Promise<LibrarySummary>
  /** The studio's clip manager, which is the one screen whose job is the whole
   *  library — and it still pages through it. */
  studioClips(query: string, limit: number, offset: number): Promise<StudioClips>
  /** What the next unnamed clip in a playlist should be called. A fact about
   *  the playlist, which the app no longer holds. */
  nextClipNumber(playlist: string): Promise<number>
  clipAudioURL(clipId: string): Promise<string | null>
  /** Null until the cutter has produced one, and for ever on an audio clip. */
  clipVideoURL(clipId: string): Promise<string | null>
  createClips(clips: NewClipInput[]): Promise<Video[]>
  /** Stores the recording a batch is cut from, once, and returns its id. */
  uploadSource(file: Blob, name: string): Promise<string>
  /** The words Whisper found in a source, or word that they are still coming. */
  sourceTranscript(sourceId: string): Promise<Transcript>
  uploadClipAudio(clipId: string, audio: Blob): Promise<void>
  updateClip(clipId: string, patch: ClipPatch): Promise<Video>
  deleteClip(clipId: string): Promise<void>

  listTakes(): Promise<Take[]>
  createTake(clipId: string, audio: Blob): Promise<Take>
  getTake(takeId: string): Promise<Take>
  /** Throws away a recording and its audio. */
  deleteTake(takeId: string): Promise<void>
  takeAudioURL(takeId: string): Promise<string | null>
  /** Asks for the take to be muxed onto its clip, and reads how that is going. */
  requestDub(takeId: string): Promise<Dub>
  dub(takeId: string): Promise<Dub>

  /** Asks for a word to be looked up, and answers with the gloss if somebody
   *  already has. The line it was tapped in decides which sense gets written
   *  down, the first time anybody taps it. */
  lookUpWord(word: string, context: string): Promise<Gloss>
  /** Reads a lookup already asked for, for the wait after a `pending`. */
  wordGloss(word: string): Promise<Gloss>

  listVocab(): Promise<VocabWord[]>
  createVocabWord(word: NewVocabWord): Promise<VocabWord>
  updateVocabWord(id: string, patch: VocabPatch): Promise<VocabWord>
  deleteVocabWord(id: string): Promise<void>

  updateProfile(name: string): Promise<Profile>
  uploadAvatar(avatar: Blob): Promise<Profile>

  leaderboard(): Promise<LeaderboardRow[]>
}

export interface LibrarySummary {
  clips: number
  series: number
  categories: string[]
}

export interface StudioClips {
  clips: Video[]
  total: number
}

export interface PlaylistPage {
  playlist: Playlist
  episodes: Episode[]
}

export interface EpisodePage {
  episode: Episode
  /** Null for an episode an admin has moved out of every series; the screen
   *  drops the breadcrumb rather than inventing one. */
  playlist: Playlist | null
  clips: Video[]
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

export interface NewVocabWord {
  word: string
  ipa: string
  meaning: string
  videoId: string | null
}

export interface VocabPatch {
  status?: VocabStatus
  /** Records that the card came up in memory practice. */
  reviewed?: boolean
}

export interface LeaderboardRow {
  userId: string
  name: string
  avg: number
  takes: number
  clips: number
  isYou: boolean
}

/** The server answers `{ url }` for audio, with null for a clip that has none. */
interface SignedURL {
  url: string | null
}

class ApiRepository implements Repository {
  async me() {
    const { user } = await api.get<{ user: Profile | null }>('/auth/me')
    return user
  }

  logout() {
    return api.send<void>('POST', '/auth/logout', {})
  }

  listPlaylists() {
    return api.get<Playlist[]>('/api/playlists')
  }

  playlist(slug: string) {
    return api.get<PlaylistPage>(`/api/playlists/${encodeURIComponent(slug)}`)
  }

  episode(id: string) {
    return api.get<EpisodePage>(`/api/episodes/${id}`)
  }

  searchLibrary(query: string) {
    return api.get<SearchResults>(`/api/library/search?q=${encodeURIComponent(query)}`)
  }

  updatePlaylist(id: string, patch: PlaylistPatch) {
    return api.send<Playlist>('PATCH', `/api/admin/playlists/${id}`, patch)
  }

  updateEpisode(id: string, patch: EpisodePatch) {
    return api.send<Episode>('PATCH', `/api/admin/episodes/${id}`, patch)
  }

  deleteEpisode(id: string) {
    return api.del(`/api/admin/episodes/${id}`)
  }

  deletePlaylist(id: string) {
    return api.del(`/api/admin/playlists/${id}`)
  }

  clipsByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([])
    return api.get<Video[]>(`/api/clips?ids=${ids.join(',')}`)
  }

  async clip(id: string) {
    try {
      return await api.get<Video>(`/api/clips/${id}`)
    } catch (err) {
      // Gone is an answer, not a failure: a clip an admin deleted while
      // somebody had it open.
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  }

  featuredClips() {
    return api.get<Video[]>('/api/clips/featured')
  }

  async nextUp() {
    const { clip } = await api.get<{ clip: Video | null }>('/api/clips/next-up')
    return clip
  }

  librarySummary() {
    return api.get<LibrarySummary>('/api/library/summary')
  }

  studioClips(query: string, limit: number, offset: number) {
    const params = new URLSearchParams({ q: query, limit: String(limit), offset: String(offset) })
    return api.get<StudioClips>(`/api/admin/clips?${params.toString()}`)
  }

  async nextClipNumber(playlist: string) {
    const { next } = await api.get<{ next: number }>(
      `/api/admin/clips/next-number?playlist=${encodeURIComponent(playlist)}`,
    )
    return next
  }

  async clipAudioURL(clipId: string) {
    const { url } = await api.get<SignedURL>(`/api/clips/${clipId}/audio`)
    return url
  }

  async clipVideoURL(clipId: string) {
    const { url } = await api.get<SignedURL>(`/api/clips/${clipId}/video`)
    return url
  }

  sourceTranscript(sourceId: string) {
    return api.get<Transcript>(`/api/admin/sources/${sourceId}/transcript`)
  }

  async uploadSource(file: Blob, name: string) {
    const { id } = await api.upload<{ id: string }>(
      'POST',
      `/api/admin/sources?name=${encodeURIComponent(name)}`,
      file,
    )
    return id
  }

  createClips(clips: NewClipInput[]) {
    return api.send<Video[]>('POST', '/api/admin/clips', { clips })
  }

  async uploadClipAudio(clipId: string, audio: Blob) {
    await api.upload<{ ok: boolean }>('PUT', `/api/admin/clips/${clipId}/audio`, audio)
  }

  updateClip(clipId: string, patch: ClipPatch) {
    return api.send<Video>('PATCH', `/api/admin/clips/${clipId}`, patch)
  }

  deleteClip(clipId: string) {
    return api.del(`/api/admin/clips/${clipId}`)
  }

  listTakes() {
    return api.get<Take[]>('/api/takes')
  }

  createTake(clipId: string, audio: Blob) {
    return api.upload<Take>('POST', `/api/takes?clipId=${encodeURIComponent(clipId)}`, audio)
  }

  getTake(takeId: string) {
    return api.get<Take>(`/api/takes/${takeId}`)
  }

  deleteTake(takeId: string) {
    return api.del(`/api/takes/${takeId}`)
  }

  async takeAudioURL(takeId: string) {
    const { url } = await api.get<SignedURL>(`/api/takes/${takeId}/audio`)
    return url
  }


  requestDub(takeId: string) {
    return api.send<Dub>('POST', `/api/takes/${takeId}/dub`, {})
  }

  dub(takeId: string) {
    return api.get<Dub>(`/api/takes/${takeId}/dub`)
  }

  lookUpWord(word: string, context: string) {
    return api.send<Gloss>('POST', `/api/words/${encodeURIComponent(word)}`, { context })
  }

  wordGloss(word: string) {
    return api.get<Gloss>(`/api/words/${encodeURIComponent(word)}`)
  }

  listVocab() {
    return api.get<VocabWord[]>('/api/vocab')
  }

  createVocabWord(word: NewVocabWord) {
    return api.send<VocabWord>('POST', '/api/vocab', word)
  }

  updateVocabWord(id: string, patch: VocabPatch) {
    return api.send<VocabWord>('PATCH', `/api/vocab/${id}`, patch)
  }

  deleteVocabWord(id: string) {
    return api.del(`/api/vocab/${id}`)
  }

  updateProfile(name: string) {
    return api.send<Profile>('PATCH', '/api/profile', { name })
  }

  uploadAvatar(avatar: Blob) {
    return api.upload<Profile>('PUT', '/api/profile/avatar', avatar)
  }

  leaderboard() {
    return api.get<LeaderboardRow[]>('/api/leaderboard')
  }
}

export const repository: Repository = new ApiRepository()
