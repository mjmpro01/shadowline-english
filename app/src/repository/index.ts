import { DEFAULT_PROFILE, SEED_VIDEOS, SEED_VOCAB } from '../data/seed'
import { metricsForTake } from '../lib/score'
import type { AppData, Profile, Take, Video, VocabWord } from '../data/types'

/**
 * The app's data seam. Today it is backed by localStorage; swapping in a real
 * API means implementing this interface against the backend and changing the
 * export at the bottom of this file — no screen code changes.
 */
export interface Repository {
  loadAll(): Promise<AppData>
  saveVideos(videos: Video[]): Promise<void>
  saveTakes(takes: Take[]): Promise<void>
  saveVocab(vocab: VocabWord[]): Promise<void>
  saveProfile(profile: Profile): Promise<void>
  saveSession(loggedIn: boolean): Promise<void>
  saveAdmin(isAdmin: boolean): Promise<void>
}

const KEYS = {
  videos: 'shadowline.videos',
  takes: 'shadowline.takes',
  vocab: 'shadowline.vocab',
  profile: 'shadowline.profile',
  session: 'shadowline.session',
  admin: 'shadowline.admin',
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked — the session still works, it just won't persist */
  }
}

function seedVideos(): Video[] {
  return SEED_VIDEOS.map(({ history: _history, metrics: _metrics, ...video }) => video)
}

/** Expands each clip's authored score history into individual take records. */
function seedTakes(): Take[] {
  const takes: Take[] = []
  for (const video of SEED_VIDEOS) {
    const latest = video.history[video.history.length - 1]
    video.history.forEach((score, i) => {
      takes.push({
        id: `${video.id}-t${i + 1}`,
        videoId: video.id,
        score,
        scores: metricsForTake(video.metrics, score, latest),
        recordedAt: new Date(Date.now() - (video.history.length - i) * 86400000).toISOString(),
        audioKey: null,
        analysis: null,
      })
    })
  }
  return takes
}

class LocalRepository implements Repository {
  async loadAll(): Promise<AppData> {
    return {
      videos: read(KEYS.videos, seedVideos()).map((video) => ({
        ...video,
        playlist: video.playlist ?? '',
        categories: video.categories ?? [],
        featured: video.featured ?? false,
      })),
      takes: read(KEYS.takes, seedTakes()),
      vocab: read(KEYS.vocab, SEED_VOCAB).map((word) => ({ ...word, reviewedAt: word.reviewedAt ?? null })),
      profile: read<Profile>(KEYS.profile, DEFAULT_PROFILE),
      loggedIn: read(KEYS.session, false),
      isAdmin: read(KEYS.admin, false),
    }
  }

  async saveVideos(videos: Video[]) {
    write(KEYS.videos, videos)
  }

  async saveTakes(takes: Take[]) {
    write(KEYS.takes, takes)
  }

  async saveVocab(vocab: VocabWord[]) {
    write(KEYS.vocab, vocab)
  }

  async saveProfile(profile: Profile) {
    write(KEYS.profile, profile)
  }

  async saveSession(loggedIn: boolean) {
    write(KEYS.session, loggedIn)
  }

  async saveAdmin(isAdmin: boolean) {
    write(KEYS.admin, isAdmin)
  }
}

export const repository: Repository = new LocalRepository()
