import { useEffect, useState } from 'react'
import type { Dub } from '../data/types'
import { ApiError } from './api'
import { repository } from '../repository'

/** How often to ask whether the dub is there. Muxing is sub-second work, so
 *  this is a short wait rather than a background errand. */
const POLL_MS = 1500

export interface DubState {
  /** Null until the first answer for this take has come back. */
  dub: Dub | null
  /** What went wrong asking for one, in words worth showing. */
  error: string | null
  request: () => Promise<void>
}

/**
 * The exported dub for a take: reads it, asks for it, and waits while it is
 * made.
 *
 * Shared because both screens offer it. The design put "Save dub" in the
 * Practice column — a learner who has just nailed a line should not have to go
 * somewhere else to keep it — and Dub Review offers it too, over whichever take
 * you are reviewing.
 */
export function useDub(takeId: string | null): DubState {
  // Keyed by take, so switching takes shows nothing rather than the previous
  // one's file while the new answer is in flight.
  const [resolved, setResolved] = useState<{ takeId: string; dub: Dub } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Bumped when a dub is asked for, to restart the read below. Without it the
  // poll only ever runs on arrival: it self-schedules while it sees `pending`,
  // and a request that sets `pending` from outside leaves nothing running — the
  // screen would wait for ever on a file that was already made.
  const [requested, setRequested] = useState(0)

  useEffect(() => {
    if (!takeId) return
    let active = true
    let timer: ReturnType<typeof setTimeout>

    const ask = async () => {
      try {
        const next = await repository.dub(takeId)
        if (!active) return
        setResolved({ takeId, dub: next })
        if (next.status === 'pending') timer = setTimeout(ask, POLL_MS)
      } catch {
        // Keep asking: the worker may still be running, and the next answer may
        // be the file.
        if (active) timer = setTimeout(ask, POLL_MS)
      }
    }
    void ask()

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [takeId, requested])

  const request = async () => {
    if (!takeId) return
    setError(null)
    setResolved({ takeId, dub: { status: 'pending', url: null } })
    try {
      setResolved({ takeId, dub: await repository.requestDub(takeId) })
      setRequested((n) => n + 1)
    } catch (err) {
      // The common one is a clip with no picture to dub onto: an audio clip, or
      // one whose cut has not landed yet. Saying which beats a dead button.
      setResolved({ takeId, dub: { status: 'none', url: null } })
      setError(err instanceof ApiError ? err.message : 'Could not start the export.')
    }
  }

  return {
    dub: resolved?.takeId === takeId ? resolved.dub : null,
    error,
    request,
  }
}
