/**
 * The shapes the console reads off the API.
 *
 * Its own copy rather than the learner app's: that file also carries takes,
 * vocabulary, scores and pitch contours, none of which a console has any
 * business knowing about. What the two do share is the wire, and the Go tests
 * are what hold the server to it.
 */

/** The longest a clip may be: a whole song, when a karaoke video is taken as
 *  one clip. The server enforces the same number; this copy is what the studio
 *  checks before anything is sent. */
export const MAX_CLIP_SECONDS = 360

/** The longest line the studio proposes on its own. A clip is usually one line
 *  to shadow — a spoken line, or a line of a song, which runs longer — and a
 *  recording is cut into those at its pauses unless it is taken whole. */
export const LINE_SECONDS = 30

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
  /** While pending: waiting for the transcriber, or being transcribed. */
  stage?: 'queued' | 'running'
  /** Recordings queued before this one and still waiting. */
  ahead?: number
  attempts?: number
  maxAttempts?: number
  /** Why the last attempt failed — on a failed transcript, why it gave up. */
  error?: string
  queuedAt?: string
  startedAt?: string
  /** The transcriber's last heartbeat; null when it has never run. */
  transcriber?: WorkerStatus | null
  /** Set by the studio, not the server: the recording never reached the
   *  server, so there was nothing to transcribe. */
  uploadFailed?: boolean
  /** Which request failed when `uploadFailed`: announcing the upload, or
   *  sending its bytes. */
  uploadStep?: 'announce' | 'send'
}

/** A worker's last heartbeat. */
export interface WorkerStatus {
  seenAt: string
  /** Working on something at that beat, rather than waiting for work. */
  busy: boolean
  /** Beat within the last 45 seconds. */
  online: boolean
  /** The code it runs, as it reported it; empty from a worker too old to. */
  version?: string
  /** When the process started. */
  startedAt?: string | null
}

/** Every worker that beats, by the name it beats under. */
export type WorkerService = 'transcribing' | 'cutting' | 'scoring' | 'dubbing' | 'glossing'

/** Which code every part runs, and which workers are alive.
 *
 *  `api` is null, and a worker absent, when the API was built before it
 *  reported them: an API left running from before a pull is the very thing
 *  this answer is for, so it has to read from one. A worker that is present
 *  but null has never beaten. */
export type Services = { api: { version: string; startedAt: string } | null } & Partial<
  Record<WorkerService, WorkerStatus | null>
>

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
  /** The uploaded cover, or else the still of the first clip that has one. */
  coverUrl: string
  /** Whether `coverUrl` is an uploaded cover, which can be removed, rather
   *  than a still borrowed from a clip. */
  ownCover: boolean
  createdAt: string
}

/** A shelf of the library's front screen, and the series on it in order. */
export interface Section {
  id: string
  slug: string
  title: string
  description: string
  /** One emoji beside the title, or empty. */
  icon: string
  position: number
  /** How many series are on the shelf. */
  series: number
  playlistIds: string[]
  createdAt: string
}

export interface SectionPatch {
  title?: string
  description?: string
  icon?: string
  position?: number
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
  /** Its sound is still being cut from the recording. */
  audioPending?: boolean
  /** It has its original sound, which takes are scored against. */
  hasAudio?: boolean
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
