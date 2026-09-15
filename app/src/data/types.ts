export type MetricName = 'Intonation' | 'Rhythm' | 'Stress' | 'Variation'

export type MetricScores = Record<MetricName, number>

export const METRIC_NAMES: MetricName[] = ['Intonation', 'Rhythm', 'Stress', 'Variation']

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
}

export interface Take {
  id: string
  videoId: string
  score: number
  scores: MetricScores
  recordedAt: string
  /** Key into the audio blob store; null for seeded history with no recording. */
  audioKey: string | null
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
}
