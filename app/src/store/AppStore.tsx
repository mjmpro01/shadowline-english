import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LOOKUP } from '../data/seed'
import type { AppData, Take, Video, VocabStatus, VocabWord } from '../data/types'
import { invalidateBlobUrl, putBlob } from '../lib/blobStore'
import { mockScoreForTake } from '../lib/score'
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
    }
    setData((prev) => {
      const videos = [video, ...prev.videos]
      void repository.saveVideos(videos)
      return { ...prev, videos }
    })
    return video
  }, [])

  const addTake = useCallback((videoId: string, audio: Blob | null): Take => {
    const id = `${videoId}-u${Date.now()}`
    const { score, scores } = mockScoreForTake(id)
    const audioKey = audio ? `take-${id}` : null
    if (audio && audioKey) void putBlob(audioKey, audio)
    const take: Take = { id, videoId, score, scores, recordedAt: new Date().toISOString(), audioKey }
    setData((prev) => {
      const takes = [...prev.takes, take]
      void repository.saveTakes(takes)
      return { ...prev, takes }
    })
    return take
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
      const sparkline = takes.map((t) => t.score)
      return {
        takes,
        attempts: takes.length,
        lastScore: sparkline.length ? sparkline[sparkline.length - 1] : 0,
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
      toggleVocabWord,
      setVocabStatus,
      updateProfile,
      statsFor,
    }),
    [data, ready, login, logout, importVideo, addTake, toggleVocabWord, setVocabStatus, updateProfile, statsFor],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
