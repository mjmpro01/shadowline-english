export type MetricName = 'Intonation' | 'Rhythm' | 'Stress' | 'Variation'

export type MetricScores = Record<MetricName, number>

export const METRIC_NAMES: MetricName[] = ['Intonation', 'Rhythm', 'Stress', 'Variation']

/**
 * A clip is one line to shadow, not a passage. Everything entering the app —
 * the source audio and the takes recorded against it — is held to this. The
 * server enforces the same number; this copy is what the studio and the
 * recorder check against before anything is sent.
 */
export const MAX_CLIP_SECONDS = 6

export interface CaptionLine {
  text: string
  ipa: string
}

/** A learner's voice muxed onto the clip's picture: a file to keep or send.
 *
 * `none` covers both "never asked for" and "asked for and given up on" — the
 * screen offers the button again either way. */
export interface Dub {
  status: 'none' | 'pending' | 'ready'
  url: string | null
}

/** What a word means and how it is said, looked up once and kept for ever.
 *
 * `pending` while the worker has it — the first tap on a word nobody has ever
 * tapped. `none` means no meaning is coming: either nothing asked for one or
 * the lookup gave up. Both still carry whatever is known, which for a word
 * CMUdict has is a real pronunciation and no definition. */
export interface Gloss {
  status: 'ready' | 'pending' | 'none'
  word: string
  /** Empty when CMUdict has never heard of the word. */
  ipa: string
  /** Empty while the lookup is running, and when it failed. */
  meaning: string
  /** Which dictionary or model wrote the meaning. Shown under it: Merriam-
   *  Webster's free tier requires their name wherever their definitions
   *  appear, and a learner is owed the difference anyway between a
   *  lexicographer's sentence and a model's. Empty when there is no meaning. */
  source: string
}

/**
 * A series: Friends, a lecture course, a channel. The top level of the library,
 * holding episodes, which hold clips.
 *
 * It was a name typed on every clip until the library became a tree. The counts
 * and the cover are read from the server rather than worked out here: the app
 * no longer holds every clip in the library, which is the point of the tree.
 */
export interface Playlist {
  id: string
  slug: string
  title: string
  description: string
  /** An admin's choice of what to push. `recentTakes` is the measurement
   *  beside it, so a badge nobody has earned reads as the claim it is. */
  hot: boolean
  /** Takes recorded against this series in the last seven days. */
  recentTakes: number
  position: number
  episodes: number
  clips: number
  /** The still of the first clip in the series that has one; empty until the
   *  cutter has produced one, and for a series cut from audio. */
  coverUrl: string
  createdAt: string
}

/**
 * One episode: the recording an admin uploaded, and the clips cut out of it.
 *
 * "Episode" rather than "video" because a clip is already called a video
 * everywhere a learner can see one — `Take.videoId` is a clip's id — and two
 * things under one word in one library is a trap.
 */
export interface Episode {
  id: string
  playlistId: string | null
  title: string
  position: number
  published: boolean
  clips: number
  /** The practising in this episode — the clips added up — not the length of
   *  the recording they were cut from. */
  seconds: number
  posterUrl: string
  createdAt: string
}

/** What one search across the library found, kept apart by level: a series and
 *  a six-second clip in one ranked list would mean different things in the
 *  same row. */
export interface SearchResults {
  playlists: Playlist[]
  episodes: Episode[]
  clips: Video[]
}

export interface Video {
  id: string
  title: string
  source: string
  /** The series this clip is in, by name. The name also lives on the playlist
   *  row now; this copy is what the studio's filter and the dashboard read. */
  playlist: string
  /** Free-form tags the library can be filtered by. */
  categories: string[]
  /** Surfaced on the dashboard as something worth practising next. */
  featured: boolean
  timestamp: string
  durationSeconds: number
  summary: string
  captions: CaptionLine[]
  /** Whether a cut of the original video exists for this clip.
   *
   * False covers two cases the app treats alike: a clip cut from audio, and one
   * cut from video whose cut has not finished yet. Both play the audio. */
  hasVideo: boolean
  /** True while the cutter still owes this clip a picture. The player polls
   *  for the video URL in that case rather than giving up after one null. */
  videoPending: boolean
  /** True while the cutter still owes this clip its sound, which is cut on the
   *  server a few seconds after publishing. The player asks again until it is
   *  there; a take recorded meanwhile is scored once it is. */
  audioPending?: boolean
  /** A still from the clip, for the card. Empty for a clip cut from audio, and
   *  for one whose cut has not finished — both fall back to the play icon. */
  posterUrl: string
  /** Where in its source recording this clip begins, which is the order an
   *  episode reads in. Zero for the starter clips, which came from nowhere. */
  startSeconds: number
  /** The episode this clip was cut from, and the series that is in. Null only
   *  for a clip published with no playlist name at all. */
  episodeId: string | null
  playlistId: string | null
  createdAt: string
}

/**
 * A take is scored on the server, which takes a moment, so it arrives `pending`
 * and is filled in afterwards. `failed` is a real outcome, not an error the app
 * hides: a recording with no speech in it cannot be measured, and saying so is
 * better than inventing a number for it.
 */
export type TakeStatus = 'pending' | 'scored' | 'failed'

export interface Take {
  id: string
  videoId: string
  /** Match score against the clip's original audio; null until scored. */
  score: number | null
  scores: MetricScores | null
  /** Measured contour; null until scored, and for takes we could not measure. */
  analysis: TakeAnalysis | null
  status: TakeStatus
  /** Why scoring gave up, when it did. */
  error?: string
  recordedAt: string
  hasAudio: boolean
}

export type VocabStatus = 'new' | 'learning' | 'known'

export interface VocabWord {
  id: string
  word: string
  ipa: string
  meaning: string
  status: VocabStatus
  videoId: string | null
  /** Last time this came up in memory practice; null until it has. */
  reviewedAt: string | null
  /** How far ahead this card is currently scheduled. Zero for a word nobody
   *  has recalled yet, and for one just forgotten. */
  intervalDays: number
  /** When it is next worth asking about. The server sets it — a deck built
   *  from a device with a wrong clock would be the wrong deck. */
  dueAt: string
}

export interface NeedPracticeItem {
  id: string
  title: string
  detail: string
  videoId: string
}

/** An announcement an admin put on a screen. `linkUrl` is a path in the app or
 *  an https address — the server refuses anything else. */
export interface Banner {
  id: string
  title: string
  body: string
  linkUrl: string
  linkLabel: string
  imageUrl: string
}

export interface Profile {
  id: string
  name: string
  email: string
  /** Signed URL from the server, or null when no avatar has been uploaded. */
  avatarUrl: string | null
  /** Decided by the server from ADMIN_EMAILS. The app cannot set it. */
  isAdmin: boolean
  /** Whether this server keeps passwords (Keycloak), so one can be changed. */
  passwords?: boolean
}

export interface AppData {
  videos: Video[]
  takes: Take[]
  vocab: VocabWord[]
  profile: Profile | null
}

/** One point of a measured pitch contour: seconds, semitones from the
    speaker's own median, and distance from the reference where known. */
export interface ContourPoint {
  t: number
  s: number
  d?: number
}

/**
 * Whether the learner said the words, not just the tune.
 *
 * Everything else a take is scored on is prosody — where the pitch goes, where
 * the stress lands — and none of it looks at what was actually said. This is
 * the transcriber's account of that, and it is evidence rather than a verdict:
 * a word marked unheard is a word Whisper did not hear, which is why the
 * screens say "we did not hear" and never "you said it wrong".
 */
export interface WordCheck {
  /** The line word by word, as the caption writes it, in caption order. */
  line: { text: string; heard: boolean }[]
  /** What the transcriber made of the recording, normalised. */
  heard: string[]
  /** How much of the line came back, 0 to 1. */
  accuracy: number
}

export interface TakeAnalysis {
  user: ContourPoint[]
  reference: ContourPoint[] | null
  duration: number
  /** Mean semitone distance after alignment; null when nothing to compare to. */
  meanDeviation: number | null
  /** Absent when there was nothing to check: a clip with no line, a recording
   *  the transcriber made nothing of, or a deployment with no model. Absent is
   *  not zero, and the screens say nothing rather than accusing anybody. */
  words?: WordCheck
}
