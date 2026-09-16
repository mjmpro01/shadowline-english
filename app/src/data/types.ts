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

export interface Video {
  id: string
  title: string
  source: string
  /** The batch this clip was cut from — a lesson, an episode, an interview. */
  playlist: string
  /** Free-form tags the library can be filtered by. */
  categories: string[]
  /** Surfaced on the dashboard as something worth practising next. */
  featured: boolean
  timestamp: string
  durationSeconds: number
  summary: string
  captions: CaptionLine[]
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
}

export interface NeedPracticeItem {
  id: string
  title: string
  detail: string
  videoId: string
}

export interface Profile {
  id: string
  name: string
  email: string
  /** Signed URL from the server, or null when no avatar has been uploaded. */
  avatarUrl: string | null
  /** Decided by the server from ADMIN_EMAILS. The app cannot set it. */
  isAdmin: boolean
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

export interface TakeAnalysis {
  user: ContourPoint[]
  reference: ContourPoint[] | null
  duration: number
  /** Mean semitone distance after alignment; null when nothing to compare to. */
  meanDeviation: number | null
}
