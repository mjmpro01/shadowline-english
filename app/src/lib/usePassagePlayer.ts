import { useCallback, useEffect, useRef, useState } from 'react'
import { repository } from '../repository'

/**
 * The sound of a passage of lines, played through one after another, or one
 * phrase of one line at a time.
 *
 * One <audio> for all of it: a dictation listens to the whole passage, then to
 * a phrase over and over, and two players could end up talking at once. Always
 * at normal speed — the method is to hear English as it is spoken.
 */

export type PlayerState =
  | { status: 'loading' }
  | { status: 'ready' }
  /** Some line has no sound to play. */
  | { status: 'error' }

export interface PassagePlayer {
  state: PlayerState
  /** Which clip is playing, by its index in the passage; null when nothing is. */
  playing: number | null
  /** Plays every line in turn. Resolves when the last one has finished, or
   *  false when it was stopped first. */
  playAll: () => Promise<boolean>
  /** Plays a stretch of one line, by seconds from the start of its sound. */
  playRange: (clip: number, start: number, end: number) => Promise<boolean>
  stop: () => void
}

export function usePassagePlayer(clipIds: string[]): PassagePlayer {
  const key = clipIds.join(',')
  const [urls, setUrls] = useState<{ key: string; urls: string[] } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [playing, setPlaying] = useState<number | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  // The URL loaded into it, as given: `src` reads back resolved.
  const loaded = useRef<string | null>(null)
  // Each play bumps this, so one started later quietly ends any earlier one.
  const run = useRef(0)

  useEffect(() => {
    if (!key) return
    let wanted = true
    Promise.all(key.split(',').map((id) => repository.clipAudioURL(id))).then(
      (list) => {
        if (!wanted) return
        if (list.some((u) => !u)) setFailed(key)
        else setUrls({ key, urls: list as string[] })
      },
      () => wanted && setFailed(key),
    )
    return () => {
      wanted = false
    }
  }, [key])

  useEffect(() => {
    const el = new Audio()
    el.preload = 'auto'
    audio.current = el
    return () => {
      el.pause()
      el.removeAttribute('src')
      audio.current = null
      loaded.current = null
    }
  }, [])

  const ready = urls?.key === key ? urls.urls : null

  /** Plays one clip's sound from `start` to `end` (or to its end), for run `id`. */
  const segment = useCallback(
    (url: string, start: number, end: number | null, id: number) =>
      new Promise<boolean>((resolve) => {
        const el = audio.current
        if (!el) return resolve(false)
        let frame = 0
        const done = (finished: boolean) => {
          cancelAnimationFrame(frame)
          el.removeEventListener('ended', onEnded)
          el.removeEventListener('error', onError)
          // One that was stopped for a later one leaves the player to it.
          if (finished && run.current === id) el.pause()
          resolve(finished && run.current === id)
        }
        const onEnded = () => done(true)
        const onError = () => done(false)
        // A frame at a time rather than on `timeupdate`, which fires four times a
        // second: a quarter of a second too long is the start of the next word.
        const watch = () => {
          // Stopped for a later one, or the screen has gone.
          if (run.current !== id || audio.current !== el) return done(false)
          if (end !== null && el.currentTime >= end) return done(true)
          frame = requestAnimationFrame(watch)
        }
        const start_ = () => {
          el.currentTime = start
          el.playbackRate = 1
          el.play().then(watch, () => done(false))
        }
        el.addEventListener('ended', onEnded)
        el.addEventListener('error', onError)
        if (loaded.current !== url) {
          loaded.current = url
          el.src = url
          el.addEventListener('loadedmetadata', start_, { once: true })
          el.load()
        } else {
          start_()
        }
      }),
    [],
  )

  const playRange = useCallback(
    async (clip: number, start: number, end: number) => {
      if (!ready) return false
      const id = ++run.current
      setPlaying(clip)
      const finished = await segment(ready[clip], start, end, id)
      if (run.current === id) setPlaying(null)
      return finished
    },
    [ready, segment],
  )

  const playAll = useCallback(async () => {
    if (!ready) return false
    const id = ++run.current
    for (let i = 0; i < ready.length; i++) {
      setPlaying(i)
      if (!(await segment(ready[i], 0, null, id))) {
        if (run.current === id) setPlaying(null)
        return false
      }
    }
    setPlaying(null)
    return true
  }, [ready, segment])

  const stop = useCallback(() => {
    run.current++
    audio.current?.pause()
    setPlaying(null)
  }, [])

  const state: PlayerState =
    failed === key ? { status: 'error' } : ready ? { status: 'ready' } : { status: 'loading' }
  return { state, playing, playAll, playRange, stop }
}
