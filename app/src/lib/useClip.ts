import { useEffect } from 'react'
import type { Video } from '../data/types'
import { useApp } from '../store/context'

/**
 * One clip, fetched if the app does not already hold it.
 *
 * The app used to be handed every clip at sign-in, so a screen showing one
 * just looked it up. It holds a cache of what has been asked for now, and
 * "not here" means one of two things — not fetched yet, or not there at all —
 * which a screen has to tell apart before it decides between a spinner and
 * "that clip is not in the library".
 */
export function useClip(id: string | undefined): { clip: Video | null; loading: boolean } {
  const { data, ensureClips, clipMissing } = useApp()

  useEffect(() => {
    if (id) void ensureClips([id])
  }, [id, ensureClips])

  if (!id) return { clip: null, loading: false }
  const clip = data.videos.find((video) => video.id === id) ?? null
  return { clip, loading: clip === null && !clipMissing(id) }
}
