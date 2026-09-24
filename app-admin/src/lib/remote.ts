import { useEffect, useState } from 'react'
import { ApiError } from './api'

/**
 * One thing fetched from the server, and what to draw while it is not there.
 *
 * The app store holds what every screen needs — takes, vocabulary, the profile —
 * and loads it once at sign-in. The library is the one part that no longer fits
 * that shape: it is a tree now, and a screen asks for the branch it is showing
 * rather than for the whole thing. This is the small amount of state that goes
 * with such a request.
 */
export type Remote<T> =
  | { state: 'loading' }
  // `status` carries the HTTP code through, because 404 is not a failure to
  // say sorry for: a series somebody has renamed is a thing the screen can
  // explain, and "not found" from the server is not that explanation.
  | { state: 'error'; message: string; status: number }
  | { state: 'ready'; value: T }

/**
 * Fetches when `key` changes, and drops the answer to a request the screen has
 * already moved on from.
 *
 * `key` rather than a dependency array: every caller here is fetching one thing
 * identified by one string — a slug, an id, a query — and naming that string is
 * both what triggers the reload and what says which answer is still wanted.
 */
export function useRemote<T>(key: string, load: (key: string) => Promise<T>): Remote<T> {
  const [remote, setRemote] = useState<Remote<T>>({ state: 'loading' })

  useEffect(() => {
    // Not `setRemote({state:'loading'})` first: that is a second render before
    // the request has even gone out, and it blanks a list the learner is
    // reading to replace it with the same list a moment later. A screen that
    // wants the spinner back between keys can key its own element on it.
    let wanted = true
    load(key)
      .then((value) => {
        if (wanted) setRemote({ state: 'ready', value })
      })
      .catch((err: unknown) => {
        if (!wanted) return
        setRemote({
          state: 'error',
          message: err instanceof ApiError ? err.message : 'Could not load that.',
          status: err instanceof ApiError ? err.status : 0,
        })
      })
    return () => {
      wanted = false
    }
    // `load` is a module-level function at every call site; listing it would
    // re-fetch on every render for callers that write it inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return remote
}

/**
 * A value that follows another one, a beat behind.
 *
 * Search runs on the server now, so the request goes out when somebody stops
 * typing rather than on every keystroke: "Friends" is six letters and one
 * question, not six questions of which five are thrown away.
 */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}
