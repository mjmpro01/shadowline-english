import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LOOKUP } from '../data/seed'
import { MAX_CLIP_SECONDS, type AppData, type Take, type Video, type VocabStatus, type VocabWord } from '../data/types'
import { getBlob, invalidateBlobUrl, putBlob } from '../lib/blobStore'
import { analyseTake } from '../lib/dsp/analyse'
import { normalizeWord } from '../lib/text'
import { repository } from '../repository'
import { AppContext, type ClipEdit, type NewClip, type Store, type VideoStats } from './context'

function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${(whole % 60).toString().padStart(2, '0')}`
}

const EMPTY: AppData = {
  videos: [],
  takes: [],
  vocab: [],
  profile: { name: '', email: '', avatarKey: null },
  loggedIn: false,
  isAdmin: false,
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY)
  const [ready, setReady] = useState(false)
  // Async analysis reads the latest records without re-creating every callback.
  const dataRef = useRef<AppData>(EMPTY)

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    repository.loadAll().then((loaded) => {
      setData(loaded)
      setReady(true)
    })
  }, [])

  const login = useCallback(() => {
    void repository.saveSession(true)
    setData((prev) => ({ ...prev, loggedIn: true }))
  }, [])

  const logout = useCallback(() => {
    void repository.saveSession(false)
    setData((prev) => ({ ...prev, loggedIn: false }))
  }, [])

  const setAdmin = useCallback((isAdmin: boolean) => {
    void repository.saveAdmin(isAdmin)
    setData((prev) => ({ ...prev, isAdmin }))
  }, [])

  const addClips = useCallback(async (clips: NewClip[]) => {
    const created: Video[] = []
    // A clip is one line: nothing longer reaches the library, whatever the
    // studio's UI allowed while the cuts were being adjusted.
    for (const [index, clip] of clips.filter((c) => c.end - c.start <= MAX_CLIP_SECONDS + 0.01).entries()) {
      const id = `clip-${Date.now()}-${index}`
      const key = `source-${id}`
      await putBlob(key, clip.audio)
      created.push({
        id,
        title: clip.title || clip.line || `Untitled line ${index + 1}`,
        source: clip.source,
        playlist: clip.playlist,
        categories: clip.categories,
        timestamp: `${clock(clip.start)}–${clock(clip.end)}`,
        duration: clock(clip.end - clip.start),
        summary: 'No takes recorded yet — practice this clip to see your pitch analysis.',
        captions: [{ text: clip.line, ipa: clip.ipa }],
        sourceAudioKey: key,
      })
    }
    setData((prev) => {
      const videos = [...created, ...prev.videos]
      void repository.saveVideos(videos)
      return { ...prev, videos }
    })
  }, [])

  const updateClip = useCallback((id: string, edit: ClipEdit) => {
    setData((prev) => {
      const videos = prev.videos.map((video) => {
        if (video.id !== id) return video
        const [caption] = video.captions
        return {
          ...video,
          title: edit.title ?? video.title,
          playlist: edit.playlist ?? video.playlist,
          categories: edit.categories ?? video.categories,
          captions:
            edit.line === undefined && edit.ipa === undefined
              ? video.captions
              : [
                  { text: edit.line ?? caption?.text ?? '', ipa: edit.ipa ?? caption?.ipa ?? '' },
                  ...video.captions.slice(1),
                ],
        }
      })
      void repository.saveVideos(videos)
      return { ...prev, videos }
    })
  }, [])

  /** Removes the clip and the practice history that only made sense with it. */
  const deleteClip = useCallback((id: string) => {
    setData((prev) => {
      const videos = prev.videos.filter((video) => video.id !== id)
      const takes = prev.takes.filter((take) => take.videoId !== id)
      void repository.saveVideos(videos)
      void repository.saveTakes(takes)
      return { ...prev, videos, takes }
    })
  }, [])

  const addTake = useCallback(async (videoId: string, audio: Blob | null): Promise<Take> => {
    const id = `${videoId}-u${Date.now()}`
    const audioKey = audio ? `take-${id}` : null
    if (audio && audioKey) await putBlob(audioKey, audio)

    let result = null
    if (audio) {
      const video = dataRef.current.videos.find((v) => v.id === videoId)
      const sourceKey = video?.sourceAudioKey
      result = await analyseTake(
        audio,
        sourceKey ? { key: sourceKey, load: () => getBlob(sourceKey).then((b) => b ?? null) } : null,
      )
    }

    const take: Take = {
      id,
      videoId,
      score: result?.score ?? null,
      scores: result?.scores ?? null,
      recordedAt: new Date().toISOString(),
      audioKey,
      analysis: result?.analysis ?? null,
    }
    setData((prev) => {
      const takes = [...prev.takes, take]
      void repository.saveTakes(takes)
      return { ...prev, takes }
    })
    return take
  }, [])

  /** Re-measures an existing take — used once a clip finally has its original audio. */
  const scoreTake = useCallback(async (takeId: string) => {
    const current = dataRef.current
    const take = current.takes.find((t) => t.id === takeId)
    if (!take?.audioKey) return
    const video = current.videos.find((v) => v.id === take.videoId)
    if (!video?.sourceAudioKey) return

    const takeBlob = await getBlob(take.audioKey)
    if (!takeBlob) return
    const sourceKey = video.sourceAudioKey
    const result = await analyseTake(takeBlob, {
      key: sourceKey,
      load: () => getBlob(sourceKey).then((b) => b ?? null),
    })
    if (!result) return

    setData((prev) => {
      const takes = prev.takes.map((t) =>
        t.id === takeId ? { ...t, score: result.score, scores: result.scores, analysis: result.analysis } : t,
      )
      void repository.saveTakes(takes)
      return { ...prev, takes }
    })
  }, [])

  const toggleVocabWord = useCallback<Store['toggleVocabWord']>((raw, videoId) => {
    const word = normalizeWord(raw)
    let outcome: 'added' | 'removed' | 'known' = 'added'
    setData((prev) => {
      const existing = prev.vocab.find((v) => v.word === word)
      if (existing) {
        // Seeded words stay put; only words added from a caption can be undone.
        if (!existing.id.startsWith('c-')) {
          outcome = 'known'
          return prev
        }
        outcome = 'removed'
        const vocab = prev.vocab.filter((v) => v.word !== word)
        void repository.saveVocab(vocab)
        return { ...prev, vocab }
      }
      const looked = LOOKUP[word]
      const entry: VocabWord = {
        id: `c-${word}`,
        word,
        ipa: looked?.ipa ?? `/${word}/`,
        meaning: looked?.meaning ?? 'Auto-translated definition',
        status: 'new',
        videoId,
      }
      const vocab = [...prev.vocab, entry]
      void repository.saveVocab(vocab)
      return { ...prev, vocab }
    })
    return { word, status: outcome }
  }, [])

  const setVocabStatus = useCallback((id: string, status: VocabStatus) => {
    setData((prev) => {
      const vocab = prev.vocab.map((v) => (v.id === id ? { ...v, status } : v))
      void repository.saveVocab(vocab)
      return { ...prev, vocab }
    })
  }, [])

  const updateProfile = useCallback(async (name: string, email: string, avatar: Blob | null) => {
    let avatarKey: string | null = null
    if (avatar) {
      avatarKey = `avatar-${Date.now()}`
      await putBlob(avatarKey, avatar)
    }
    setData((prev) => {
      if (avatarKey && prev.profile.avatarKey) invalidateBlobUrl(prev.profile.avatarKey)
      const profile = { name, email, avatarKey: avatarKey ?? prev.profile.avatarKey }
      void repository.saveProfile(profile)
      return { ...prev, profile }
    })
  }, [])

  const statsFor = useCallback(
    (videoId: string): VideoStats => {
      const takes = data.takes.filter((t) => t.videoId === videoId)
      const scored = takes.filter((t): t is Take & { score: number } => t.score !== null)
      const sparkline = scored.map((t) => t.score)
      return {
        takes,
        attempts: takes.length,
        lastScore: sparkline.length ? sparkline[sparkline.length - 1] : null,
        sparkline: sparkline.length ? sparkline : [0],
      }
    },
    [data.takes],
  )

  const value = useMemo<Store>(
    () => ({
      data,
      ready,
      login,
      logout,
      setAdmin,
      addClips,
      updateClip,
      deleteClip,
      addTake,
      scoreTake,
      toggleVocabWord,
      setVocabStatus,
      updateProfile,
      statsFor,
    }),
    [
      data,
      ready,
      login,
      logout,
      setAdmin,
      addClips,
      updateClip,
      deleteClip,
      addTake,
      scoreTake,
      toggleVocabWord,
      setVocabStatus,
      updateProfile,
      statsFor,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
