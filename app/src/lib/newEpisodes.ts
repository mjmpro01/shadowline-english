import { useEffect, useSyncExternalStore } from 'react'
import { repository, type NewEpisodes } from '../repository'

/**
 * What is new to the learner, asked for once a session and shared by every
 * screen that tags it: the dashboard's row, the series cards, the episode rows.
 *
 * Opening an episode takes it off here straight away, so its "New" tag goes the
 * moment the learner has been in, without asking the server again; the server
 * is told as well, so it stays gone tomorrow.
 */

const EMPTY: NewEpisodes = { episodes: [], series: {} }

let current: NewEpisodes | null = null
let asking: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function load(): Promise<void> {
  if (asking) return asking
  asking = repository
    .newEpisodes()
    .then((value) => {
      current = value
      emit()
    })
    .catch(() => {
      // Nothing new is shown rather than an error: a tag is not worth one.
      current = EMPTY
      emit()
    })
  return asking
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** What is new to the learner; empty until it has arrived. */
export function useNewEpisodes(): NewEpisodes {
  const value = useSyncExternalStore(subscribe, () => current ?? EMPTY)
  useEffect(() => {
    if (current === null) void load()
  }, [])
  return value
}

/** The learner opened an episode: it is no longer new to them. */
export function markEpisodeSeen(id: string): void {
  void repository.markSeen(id).catch(() => undefined)
  if (!current) return
  const gone = current.episodes.find((e) => e.id === id)
  const playlistId = gone?.playlistId
  current = {
    episodes: current.episodes.filter((e) => e.id !== id),
    series:
      playlistId && current.series[playlistId]
        ? { ...current.series, [playlistId]: current.series[playlistId] - 1 }
        : current.series,
  }
  emit()
}

/** Forgets what was asked, for a learner signing out or another signing in. */
export function resetNewEpisodes(): void {
  current = null
  asking = null
  emit()
}
