import { api, ApiError } from '../lib/api'
import type {
  Dub,
  Episode,
  Gloss,
  Playlist,
  Profile,
  SearchResults,
  Take,
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
  clipAudioURL(clipId: string): Promise<string | null>
  /** Null until the cutter has produced one, and for ever on an audio clip. */
  clipVideoURL(clipId: string): Promise<string | null>

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

  async clipAudioURL(clipId: string) {
    const { url } = await api.get<SignedURL>(`/api/clips/${clipId}/audio`)
    return url
  }

  async clipVideoURL(clipId: string) {
    const { url } = await api.get<SignedURL>(`/api/clips/${clipId}/video`)
    return url
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
