import { api } from '../lib/api'
import type {
  CaptionLine,
  Dub,
  Profile,
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

  listClips(): Promise<Video[]>
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

  // DELETE /api/takes/{id} exists on the server and is covered by its tests;
  // nothing in the app offers it yet, so it is not plumbed through here.
  listTakes(): Promise<Take[]>
  createTake(clipId: string, audio: Blob): Promise<Take>
  getTake(takeId: string): Promise<Take>
  takeAudioURL(takeId: string): Promise<string | null>
  /** Asks for the take to be muxed onto its clip, and reads how that is going. */
  requestDub(takeId: string): Promise<Dub>
  dub(takeId: string): Promise<Dub>

  listVocab(): Promise<VocabWord[]>
  createVocabWord(word: NewVocabWord): Promise<VocabWord>
  updateVocabWord(id: string, patch: VocabPatch): Promise<VocabWord>
  deleteVocabWord(id: string): Promise<void>

  updateProfile(name: string): Promise<Profile>
  uploadAvatar(avatar: Blob): Promise<Profile>

  leaderboard(): Promise<LeaderboardRow[]>
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

  listClips() {
    return api.get<Video[]>('/api/clips')
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
