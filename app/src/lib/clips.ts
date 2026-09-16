import type { Video } from '../data/types'

/** Categories are typed as a comma-separated list and stored as tags. */
export function parseCategories(input: string): string[] {
  return [...new Set(input.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean))]
}

export function formatCategories(categories: string[]): string {
  return categories.join(', ')
}

/** Every category in use, for the library's filter row. */
export function allCategories(videos: Video[]): string[] {
  return [...new Set(videos.flatMap((video) => video.categories))].sort()
}

export function allPlaylists(videos: Video[]): string[] {
  return [...new Set(videos.map((video) => video.playlist).filter(Boolean))].sort()
}

/**
 * Library search. A learner looking for a clip might remember its name, a
 * phrase from the line, where it came from, or which lesson it was in, so all
 * of those are searched rather than the title alone.
 */
export function searchClips(
  videos: Video[],
  { query = '', category = '', playlist = '' }: { query?: string; category?: string; playlist?: string },
): Video[] {
  const needle = query.trim().toLowerCase()
  return videos.filter((video) => {
    if (category && !video.categories.includes(category)) return false
    if (playlist && video.playlist !== playlist) return false
    if (!needle) return true
    const haystack = [
      video.title,
      video.source,
      video.playlist,
      ...video.categories,
      ...video.captions.map((caption) => caption.text),
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(needle)
  })
}
