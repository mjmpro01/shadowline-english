import { useEffect, useState } from 'react'
import { repository } from '../repository'

/**
 * The state of fetching a signed audio URL.
 *
 * Three outcomes, not two: the browser version returned null for both "still
 * loading" and "there is no recording", so a screen could not tell a slow
 * network from a clip with no source audio — and both rendered as the empty
 * state.
 */
export type AudioURL =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'none' }
  | { status: 'error' }

const LOADING: AudioURL = { status: 'loading' }
const NONE: AudioURL = { status: 'none' }

/** How often / how long to re-ask for a cut that has not landed yet. Matches the
 *  e2e wait: a batch of cuts can take a minute on a cold ffmpeg, and giving up
 *  early leaves the learner on audio forever even after the picture exists. */
const VIDEO_POLL_MS = 2_000
const VIDEO_POLL_TIMEOUT_MS = 120_000

function useSignedURL(
  id: string | null,
  fetcher: (id: string) => Promise<string | null>,
  options?: { pollWhileNone?: boolean },
): AudioURL {
  const [resolved, setResolved] = useState<{ id: string; value: AudioURL } | null>(null)
  const pollWhileNone = options?.pollWhileNone ?? false

  useEffect(() => {
    if (!id) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const started = Date.now()

    const ask = () => {
      fetcher(id).then(
        (url) => {
          if (!active) return
          if (url) {
            setResolved({ id, value: { status: 'ready', url } })
            return
          }
          // Still missing. Keep asking while a cut is expected; otherwise one
          // null is the answer — audio clips never grow a picture.
          if (pollWhileNone && Date.now() - started < VIDEO_POLL_TIMEOUT_MS) {
            setResolved({ id, value: NONE })
            timer = setTimeout(ask, VIDEO_POLL_MS)
            return
          }
          setResolved({ id, value: NONE })
        },
        () => active && setResolved({ id, value: { status: 'error' } }),
      )
    }
    ask()

    return () => {
      active = false
      if (timer !== undefined) clearTimeout(timer)
    }
    // fetcher is a stable repository method; re-running on identity would refetch
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pollWhileNone])

  if (!id) return NONE
  return resolved?.id === id ? resolved.value : LOADING
}

/** The clip's source audio — the thing being shadowed. */
export function useClipAudio(clipId: string | null): AudioURL {
  return useSignedURL(clipId, (id) => repository.clipAudioURL(id))
}

/** The cut of the original video, when the cutter has produced one.
 *
 * `none` is the ordinary answer for most clips: one cut from audio never has a
 * video, and one cut from video does not have it yet while the cut is queued.
 * Pass `pollWhileNone` when the clip reports `videoPending` so the picture
 * replaces the audio player once the cutter finishes, without a manual reload. */
export function useClipVideo(clipId: string | null, pollWhileNone = false): AudioURL {
  return useSignedURL(clipId, (id) => repository.clipVideoURL(id), { pollWhileNone })
}

/** A learner's own recording. */
export function useTakeAudio(takeId: string | null): AudioURL {
  return useSignedURL(takeId, (id) => repository.takeAudioURL(id))
}

/** The URL when there is one, for the many places that only need to play it. */
export function urlOf(audio: AudioURL): string | null {
  return audio.status === 'ready' ? audio.url : null
}
