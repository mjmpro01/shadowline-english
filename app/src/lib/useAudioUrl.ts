import { useEffect, useState } from 'react'
import { getBlobUrl } from './blobStore'

/** Resolves a blob-store key to a playable object URL. */
export function useBlobUrl(key: string | null): string | null {
  const [resolved, setResolved] = useState<{ key: string; url: string | null } | null>(null)

  useEffect(() => {
    if (!key) return
    let active = true
    getBlobUrl(key).then((url) => {
      if (active) setResolved({ key, url })
    })
    return () => {
      active = false
    }
  }, [key])

  return key && resolved?.key === key ? resolved.url : null
}
