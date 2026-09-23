import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MAX_CLIP_SECONDS, type AppData, type Take, type Video, type VocabStatus } from '../data/types'
import { ApiError } from '../lib/api'
import { clipName } from '../lib/clips'
import { normalizeWord } from '../lib/text'
import { clock } from '../lib/time'
import { repository, type LeaderboardRow } from '../repository'
import { AppContext, type ClipEdit, type LoadState, type NewClip, type Store, type VideoStats } from './context'

const EMPTY: AppData = { videos: [], takes: [], vocab: [], profile: null }

/**
 * How long to wait between asking whether a take has been scored, and how long
 * to keep asking. Scoring a six-second clip is sub-second work; a minute of
 * polling covers a queue that has backed up, and after that the Practice screen
 * says so rather than spinning forever.
 */
const POLL_MS = 700
const POLL_TIMEOUT_MS = 60_000

/** How often to refresh clips whose video cut is still running — library posters
 *  and hasVideo flip when the cutter finishes, without a full-page reload. */
const CUT_POLL_MS = 3_000

/** How many clips to ask for at once. Mirrors store.MaxClipIDs on the server,
 *  which is what actually enforces it. */
const CLIP_BATCH = 200

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY)
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)
  // Polling reads the latest records without re-creating every callback.
  const dataRef = useRef<AppData>(EMPTY)
  // Ids a fetch is already out for, so two screens mounting at once do not
  // both ask for the same clip. A ref because it should re-render nothing.
  const pendingRef = useRef<Set<string>>(new Set())
  const missingRef = useRef<ReadonlySet<string>>(new Set())
  // Ids the server answered for with nothing. State rather than a ref: a
  // screen waiting on a clip that turns out not to exist has to be told, and
  // nothing else about the app changes when that happens.
  const [missing, setMissing] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    missingRef.current = missing
  }, [missing])

  // No setState before the first await: the initial state is already 'loading',
  // and setting it synchronously from the effect below starts a second render
  // for nothing. `reload` handles the retry case, from an event handler.
  const load = useCallback(async () => {
    try {
      const profile = await repository.me()
      if (!profile) {
        // Not signed in is not a failure: the app shows the login screen.
        setData(EMPTY)
        setLeaderboard([])
        setState('ready')
        return
      }
      // No clips here. The library is not something the app holds any more —
      // it was 7.4MB at sign-in against forty series, most of it signed poster
      // URLs for clips nobody was going to open. `videos` below is a cache of
      // the clips screens have actually asked for, and it starts empty.
      const [takes, vocab, board] = await Promise.all([
        repository.listTakes(),
        repository.listVocab(),
        repository.leaderboard(),
      ])
      setData({ videos: [], takes, vocab, profile })
      setLeaderboard(board)
      setState('ready')
    } catch (err) {
      // Without this the browser version showed a blank page forever.
      setError(err instanceof ApiError ? err.message : 'Could not load your data.')
      setState('error')
    }
  }, [])

  useEffect(() => {
    // Every setState inside load() runs after an await, so none of them happens
    // during this effect — the rule cannot see through the async boundary.
    // eslint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  // While a clip on screen is waiting on the cutter, refresh it so its poster
  // and hasVideo flip without a manual reload — the same moment Practice's
  // player picks up the signed URL from its own poll. Only the clips being
  // waited on, not the library: the library is no longer the app's to refresh.
  const pendingIds = data.videos.filter((video) => video.videoPending).map((video) => video.id)
  const cutsPending = pendingIds.length > 0
  const pendingKey = pendingIds.join(',')
  useEffect(() => {
    if (!cutsPending || state !== 'ready') return
    let active = true
    const tick = async () => {
      try {
        const fresh = await repository.clipsByIds(pendingKey.split(','))
        if (!active) return
        const byId = new Map(fresh.map((clip) => [clip.id, clip]))
        setData((prev) => ({
          ...prev,
          videos: prev.videos.map((video) => byId.get(video.id) ?? video),
        }))
      } catch {
        // Keep what is on screen; the next tick retries.
      }
    }
    const timer = setInterval(() => void tick(), CUT_POLL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [cutsPending, pendingKey, state])

  const reload = useCallback(() => {
    setState('loading')
    setError(null)
    return load()
  }, [load])

  const logout = useCallback(async () => {
    await repository.logout()
    setData(EMPTY)
    setLeaderboard([])
  }, [])

  const addClips = useCallback(async (clips: NewClip[], sourceId?: string | null) => {
    // A clip is one line: nothing longer is sent, whatever the studio's UI
    // allowed while the cuts were being adjusted. The server checks too.
    const withinLimit = clips.filter((c) => c.end - c.start <= MAX_CLIP_SECONDS + 0.01)
    if (withinLimit.length === 0) return

    // The recording was uploaded once when the studio opened it, so publishing
    // sends its id rather than the file. A batch with no id — the upload failed
    // — still publishes: the clips are worth having with their audio, and
    // losing the admin's work over a picture would be the wrong trade.

    // Unnamed clips are numbered across the batch being published, continuing
    // from whatever the playlist already holds. Not named after their line any
    // more: transcription fills a line into every clip, and a library of whole
    // sentences for titles is a library you cannot scan.
    const playlist = withinLimit[0]?.playlist ?? ''
    // Asked of the server: it is a fact about the playlist, and the app does
    // not hold the playlist. It used to count a library it had been sent, and
    // two admins publishing to the same playlist at once both counted the same
    // thing and both started from it.
    const firstNumber = await repository.nextClipNumber(playlist)

    const created = await repository.createClips(
      withinLimit.map((clip, index) => ({
        title: clip.title || clipName(firstNumber + index),
        source: clip.source,
        playlist: clip.playlist,
        categories: clip.categories,
        timestamp: `${clock(clip.start)}–${clock(clip.end)}`,
        durationSeconds: clip.end - clip.start,
        summary: 'No takes recorded yet — practice this clip to see your pitch analysis.',
        captions: [{ text: clip.line, ipa: clip.ipa }],
        sourceId: sourceId ?? undefined,
        startSeconds: clip.start,
        endSeconds: clip.end,
      })),
    )

    // Audio goes up per clip, after the ids exist. A clip whose upload fails
    // stays in the library without source audio, which the app already handles:
    // takes against it are measured but not scored.
    await Promise.all(
      created.map((clip, index) => repository.uploadClipAudio(clip.id, withinLimit[index].audio)),
    )

    setData((prev) => ({ ...prev, videos: [...created, ...prev.videos] }))
  }, [])

  const updateClip = useCallback(async (id: string, edit: ClipEdit) => {
    const current = dataRef.current.videos.find((v) => v.id === id)
    const [caption] = current?.captions ?? []
    const captions =
      edit.line === undefined && edit.ipa === undefined
        ? undefined
        : [
            { text: edit.line ?? caption?.text ?? '', ipa: edit.ipa ?? caption?.ipa ?? '' },
            ...(current?.captions.slice(1) ?? []),
          ]

    const updated = await repository.updateClip(id, {
      title: edit.title,
      playlist: edit.playlist,
      categories: edit.categories,
      featured: edit.featured,
      captions,
    })
    setData((prev) => ({
      ...prev,
      videos: prev.videos.map((v) => (v.id === id ? updated : v)),
    }))
  }, [])

  /** Fetches clips the app does not hold yet, and remembers which ids turned
   *  out not to exist.
   *
   * `data.videos` is a cache now rather than the library. Without the second
   * half a screen could not tell "not fetched yet" from "deleted", and would
   * sit on a spinner for a clip that is never coming. */
  const ensureClips = useCallback(async (ids: string[]) => {
    const wanted = ids.filter(
      (id) =>
        id &&
        !dataRef.current.videos.some((video) => video.id === id) &&
        !missingRef.current.has(id) &&
        !pendingRef.current.has(id),
    )
    if (wanted.length === 0) return

    // Claim them before the request so two screens mounting at once do not
    // both ask for the same clip.
    for (const id of wanted) pendingRef.current.add(id)
    try {
      // In batches, because the server caps a lookup — a learner with three
      // hundred words in their vocabulary would otherwise be refused rather
      // than served, which is the opposite of what the cap is for.
      const fetched: Video[] = []
      for (let i = 0; i < wanted.length; i += CLIP_BATCH) {
        fetched.push(...(await repository.clipsByIds(wanted.slice(i, i + CLIP_BATCH))))
      }
      const found = new Set(fetched.map((clip) => clip.id))
      const gone = wanted.filter((id) => !found.has(id))
      if (gone.length > 0) {
        setMissing((prev) => new Set([...prev, ...gone]))
      }
      if (fetched.length > 0) {
        setData((prev) => {
          const known = new Set(prev.videos.map((video) => video.id))
          return { ...prev, videos: [...prev.videos, ...fetched.filter((c) => !known.has(c.id))] }
        })
      }
    } finally {
      for (const id of wanted) pendingRef.current.delete(id)
    }
  }, [])

  /** Whether this clip is known not to exist, as opposed to not fetched yet. */
  const clipMissing = useCallback((id: string) => missing.has(id), [missing])

  /** Throws a recording away.
   *
   * A bad take is a thing a learner should be able to be rid of: it sits in
   * their history, on the chart, and in the average the leaderboard reads.
   * The server has always allowed this and nothing in the app offered it. */
  const deleteTake = useCallback(async (id: string) => {
    await repository.deleteTake(id)
    setData((prev) => ({ ...prev, takes: prev.takes.filter((t) => t.id !== id) }))
  }, [])

  /** Forgets the clips an episode took with it, without reloading the world.
   *
   * The studio deletes an episode through the API, which is where the rows
   * go; this is the copy the rest of the app is holding. Not `reload()`,
   * which sets the loading state and blanks every screen that guards on it —
   * a delete should not look like a page load. */
  const forgetEpisode = useCallback((episodeId: string) => {
    setData((prev) => {
      const gone = new Set(
        prev.videos.filter((video) => video.episodeId === episodeId).map((video) => video.id),
      )
      return {
        ...prev,
        videos: prev.videos.filter((video) => !gone.has(video.id)),
        takes: prev.takes.filter((take) => !gone.has(take.videoId)),
      }
    })
  }, [])

  /** Removes the clip and the practice history that only made sense with it. */
  const deleteClip = useCallback(async (id: string) => {
    await repository.deleteClip(id)
    setData((prev) => ({
      ...prev,
      videos: prev.videos.filter((v) => v.id !== id),
      takes: prev.takes.filter((t) => t.videoId !== id),
    }))
  }, [])

  /**
   * Records a take and waits for the worker's score.
   *
   * The take is stored immediately and appears in the list straight away; the
   * score arrives afterwards. Polling stops on any settled status, so a take
   * the worker could not measure ends as `failed` rather than as a spinner.
   */
  const addTake = useCallback(async (videoId: string, audio: Blob): Promise<Take> => {
    const take = await repository.createTake(videoId, audio)
    setData((prev) => ({ ...prev, takes: [...prev.takes, take] }))

    if (take.status !== 'pending') return take

    const deadline = Date.now() + POLL_TIMEOUT_MS
    let latest = take
    while (latest.status === 'pending' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
      try {
        latest = await repository.getTake(take.id)
      } catch {
        // A blip while polling should not lose the take, which is already
        // stored; the next attempt usually succeeds.
        continue
      }
      setData((prev) => ({
        ...prev,
        takes: prev.takes.map((t) => (t.id === latest.id ? latest : t)),
      }))
    }

    if (latest.status === 'scored') {
      // A new score changes the ranking, and the dashboard would otherwise
      // show yesterday's until the next reload.
      repository.leaderboard().then(setLeaderboard, () => {})
    }
    return latest
  }, [])


  /**
   * Adds the word, or removes it if it is already collected.
   *
   * The browser version keyed words as `c-${word}` and used that prefix to
   * decide whether a word could be removed, which meant seeded words were
   * permanent and two learners collecting the same word collided. Every word
   * now belongs to a learner and every word can be dropped.
   */
  const toggleVocabWord = useCallback(async (raw: string, videoId: string | null) => {
    const word = normalizeWord(raw)
    const existing = dataRef.current.vocab.find((v) => v.word === word)

    if (existing) {
      await repository.deleteVocabWord(existing.id)
      setData((prev) => ({ ...prev, vocab: prev.vocab.filter((v) => v.id !== existing.id) }))
      return { word, status: 'removed' as const }
    }

    // No pronunciation and no meaning sent: the server holds a gloss per word,
    // shared by everyone who has collected it, and fills both in as soon as the
    // lookup lands — including on cards collected before it finished. The
    // fifteen-word table this used to read from could not do that, and every
    // word outside it got the literal string "Auto-translated definition".
    const created = await repository.createVocabWord({ word, ipa: '', meaning: '', videoId })
    setData((prev) => ({ ...prev, vocab: [...prev.vocab, created] }))
    return { word, status: 'added' as const }
  }, [])

  const patchWord = useCallback(async (id: string, status: VocabStatus, reviewed: boolean) => {
    const updated = await repository.updateVocabWord(id, { status, reviewed })
    setData((prev) => ({ ...prev, vocab: prev.vocab.map((v) => (v.id === id ? updated : v)) }))
  }, [])

  const setVocabStatus = useCallback(
    (id: string, status: VocabStatus) => patchWord(id, status, false),
    [patchWord],
  )

  /** A memory-practice answer: the new status, and the fact it came up at all. */
  const reviewWord = useCallback(
    (id: string, status: VocabStatus) => patchWord(id, status, true),
    [patchWord],
  )

  const updateProfile = useCallback(async (name: string, avatar: Blob | null) => {
    let profile = await repository.updateProfile(name)
    if (avatar) profile = await repository.uploadAvatar(avatar)
    setData((prev) => ({ ...prev, profile }))
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
      state,
      error,
      signedIn: data.profile !== null,
      // Admin comes from the server. There is no way for the app to set it —
      // the Profile screen used to have a switch that granted it to anyone.
      isAdmin: data.profile?.isAdmin ?? false,
      reload,
      logout,
      addClips,
      updateClip,
      deleteClip,
      forgetEpisode,
      ensureClips,
      clipMissing,
      addTake,
      deleteTake,
      toggleVocabWord,
      setVocabStatus,
      reviewWord,
      updateProfile,
      statsFor,
      leaderboard,
    }),
    [
      data,
      state,
      error,
      reload,
      logout,
      addClips,
      updateClip,
      deleteClip,
      forgetEpisode,
      ensureClips,
      clipMissing,
      addTake,
      deleteTake,
      toggleVocabWord,
      setVocabStatus,
      reviewWord,
      updateProfile,
      statsFor,
      leaderboard,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
