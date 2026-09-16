export type MetricName = 'Intonation' | 'Rhythm' | 'Stress' | 'Variation'

export type MetricScores = Record<MetricName, number>

export const METRIC_NAMES: MetricName[] = ['Intonation', 'Rhythm', 'Stress', 'Variation']

/**
 * A clip is one line to shadow, not a passage. Everything entering the app —
 * the source audio and the takes recorded against it — is held to this.
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
  timestamp: string
  duration: string
  summary: string
  captions: CaptionLine[]
  /** Blob key of the original clip audio, once the learner attaches it. */
  sourceAudioKey: string | null
}

export interface Take {
  id: string
  videoId: string
  /** Match score against the clip's original audio; null when none is attached. */
  score: number | null
  scores: MetricScores | null
  recordedAt: string
  /** Key into the audio blob store; null for seeded history with no recording. */
  audioKey: string | null
  /** Measured contour; null for seeded history and for takes we could not analyse. */
  analysis: TakeAnalysis | null
}

export type VocabStatus = 'new' | 'learning' | 'known'

export interface VocabWord {
  id: string
  word: string
  ipa: string
  meaning: string
  status: VocabStatus
  videoId: string | null
}

export interface NeedPracticeItem {
  id: string
  title: string
  detail: string
  videoId: string
}

export interface Profile {
  name: string
  email: string
  avatarKey: string | null
}

export interface AppData {
  videos: Video[]
  takes: Take[]
  vocab: VocabWord[]
  profile: Profile
  loggedIn: boolean
  isAdmin: boolean
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
