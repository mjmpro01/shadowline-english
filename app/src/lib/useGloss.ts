import { useEffect, useState } from 'react'
import type { Gloss } from '../data/types'
import { repository } from '../repository'

/** How often to ask whether the lookup has landed. One API call with a short
 *  ceiling, and a learner is looking at the popup waiting for it. */
const POLL_MS = 800

/**
 * What a tapped word means.
 *
 * The app used to answer this from a fifteen-word table in `seed.ts`, so every
 * other word came back as the literal string "Auto-translated definition". Now
 * it asks the server, which keeps a gloss for every word anybody has ever
 * tapped and looks up the ones it has not seen.
 *
 * Null until the first answer, which is what the popup shows a wait for. The
 * wait only ever happens once per word in the whole app: the second learner to
 * tap it reads what the first one's lookup wrote down.
 *
 * `context` is the line the word was tapped in, and decides which sense gets
 * written down the first time anybody taps it — `really` in "Are you really
 * going?" is not `really` in "I really like it". Pass it alongside the word and
 * change the two together: a word is looked up once per tap, not once per
 * keystroke.
 */
export function useGloss(word: string | null, context: string): Gloss | null {
  // Keyed by word, so tapping a second one shows a wait rather than the
  // previous word's meaning while the new answer is in flight.
  const [resolved, setResolved] = useState<{ word: string; gloss: Gloss } | null>(null)

  useEffect(() => {
    if (!word) return
    let active = true
    let timer: ReturnType<typeof setTimeout>

    const settle = (gloss: Gloss) => {
      if (!active) return
      setResolved({ word, gloss })
      if (gloss.status === 'pending') timer = setTimeout(poll, POLL_MS)
    }

    const poll = async () => {
      try {
        settle(await repository.wordGloss(word))
      } catch {
        // Keep asking: the worker may still have it, and the next answer may be
        // the definition.
        if (active) timer = setTimeout(poll, POLL_MS)
      }
    }

    // The request and the first read are the same call, so a word somebody has
    // already tapped is answered without a round trip through the queue.
    repository
      .lookUpWord(word, context)
      .then(settle)
      // Nothing to show and nothing queued. The popup keeps waiting rather than
      // claiming there is no such word: the next tap asks again.
      .catch(() => {})

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [word, context])

  return resolved?.word === word ? resolved.gloss : null
}
