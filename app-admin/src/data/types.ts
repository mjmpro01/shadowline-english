/**
 * The shapes the console reads off the API.
 *
 * Its own copy rather than the learner app's: that file also carries takes,
 * vocabulary, scores and pitch contours, none of which a console has any
 * business knowing about. What the two do share is the wire, and the Go tests
 * are what hold the server to it.
 */

/** A clip is one line to shadow, not a passage. The server enforces the same
 *  number; this copy is what the studio checks before anything is sent. */
export const MAX_CLIP_SECONDS = 6

export interface CaptionLine {
  text: string
  ipa: string
}

/** One word Whisper heard, when it was said, and how to say it. */
export interface TranscriptWord {
  start: number
  end: number
  text: string
  /** Empty when CMUdict has never heard of the word. */
  ipa: string
}

export interface Transcript {
  /** `pending` while the worker is still running, and the ordinary first
   *  answer: transcribing an hour takes minutes. `failed` means no transcript
   *  is coming and the lines have to be typed. */
  status: 'pending' | 'ready' | 'failed'
  language: string
  words: TranscriptWord[]
}

/** A series: Friends, a lecture course, a channel. */
export interface Playlist {
  id: string
  slug: string
  title: string
  description: string
  hot: boolean
  /** Takes recorded against this series in the last seven days. */
  recentTakes: number
  position: number
  episodes: number
  clips: number
  coverUrl: string
  createdAt: string
}

/** One episode: the recording an admin uploaded, and the clips cut out of it. */
export interface Episode {
  id: string
  playlistId: string | null
  title: string
  position: number
  published: boolean
  clips: number
  seconds: number
  posterUrl: string
  createdAt: string
}

export interface Video {
  id: string
  title: string
  source: string
  playlist: string
  categories: string[]
  featured: boolean
  timestamp: string
  durationSeconds: number
  summary: string
  captions: CaptionLine[]
  hasVideo: boolean
  videoPending: boolean
  posterUrl: string
  startSeconds: number
  episodeId: string | null
  playlistId: string | null
  createdAt: string
}

/** Who is signed in. `isAdmin` is decided by the server from ADMIN_EMAILS and
 *  is re-checked on every admin endpoint — this copy only decides what the
 *  console draws. */
export interface Profile {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  isAdmin: boolean
}
