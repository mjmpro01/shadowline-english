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

function useSignedURL(id: string | null, fetcher: (id: string) => Promise<string | null>): AudioURL {
  const [resolved, setResolved] = useState<{ id: string; value: AudioURL } | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    fetcher(id).then(
      (url) => active && setResolved({ id, value: url ? { status: 'ready', url } : NONE }),
      () => active && setResolved({ id, value: { status: 'error' } }),
    )
    return () => {
      active = false
    }
    // fetcher is a stable repository method; re-running on identity would refetch
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!id) return NONE
  return resolved?.id === id ? resolved.value : LOADING
}

/** The clip's source audio — the thing being shadowed. */
export function useClipAudio(clipId: string | null): AudioURL {
  return useSignedURL(clipId, (id) => repository.clipAudioURL(id))
}

/** A learner's own recording. */
export function useTakeAudio(takeId: string | null): AudioURL {
  return useSignedURL(takeId, (id) => repository.takeAudioURL(id))
}

/** The URL when there is one, for the many places that only need to play it. */
export function urlOf(audio: AudioURL): string | null {
  return audio.status === 'ready' ? audio.url : null
}
