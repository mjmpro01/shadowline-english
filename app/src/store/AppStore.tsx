import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LOOKUP } from '../data/seed'
import type { AppData, Take, Video, VocabStatus, VocabWord } from '../data/types'
import { getBlob, invalidateBlobUrl, putBlob } from '../lib/blobStore'
import { analyseTake } from '../lib/dsp/analyse'
import { normalizeWord } from '../lib/text'
import { repository } from '../repository'
import { AppContext, type Store, type VideoStats } from './context'

const EMPTY: AppData = {
  videos: [],
  takes: [],
  vocab: [],
  profile: { name: '', email: '', avatarKey: null },
  loggedIn: false,
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

  const importVideo = useCallback((url: string): Video => {
    const trimmed = url.trim()
    const video: Video = {
      id: `imp-${Date.now()}`,
      title: trimmed.replace(/^https?:\/\//, '').slice(0, 60) || 'Imported clip',
      source: 'Imported from URL',
      timestamp: '00:00–00:30',
      duration: '0:30',
      summary: 'No takes recorded yet — practice this clip to see your pitch analysis.',
      captions: [
        { text: 'Tap record and shadow the speaker line by line.', ipa: '/tæp rɪˈkɔːd ənd ˈʃædəʊ ðə ˈspiːkə/' },
      ],
      sourceAudioKey: null,
    }
    setData((prev) => {
      const videos = [video, ...prev.videos]
      void repository.saveVideos(videos)
      return { ...prev, videos }
    })
    return video
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

  const attachSourceAudio = useCallback(async (videoId: string, audio: Blob) => {
    const key = `source-${videoId}-${Date.now()}`
    await putBlob(key, audio)
    setData((prev) => {
      const videos = prev.videos.map((v) => (v.id === videoId ? { ...v, sourceAudioKey: key } : v))
      void repository.saveVideos(videos)
      return { ...prev, videos }
    })
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
      importVideo,
      addTake,
      attachSourceAudio,
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
      importVideo,
      addTake,
      attachSourceAudio,
      scoreTake,
      toggleVocabWord,
      setVocabStatus,
      updateProfile,
      statsFor,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
