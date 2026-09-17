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

/**
 * A playlist's clips, in the order they were spoken.
 *
 * By start time rather than by publish time: a batch is inserted one row after
 * another, so created_at happens to agree today and would stop agreeing the
 * first time an admin publishes a clip they cut later. The order of an episode
 * is a fact about the recording, not about when anyone pressed a button.
 *
 * Clips with no source — the starter samples — all report zero, and fall back
 * to their title so the order is at least stable.
 */
export function playlistClips(videos: Video[], playlist: string): Video[] {
  return videos
    .filter((video) => video.playlist === playlist)
    .sort((a, b) => a.startSeconds - b.startSeconds || a.title.localeCompare(b.title))
}

export interface PlaylistProgress {
  total: number
  /** How many have a take against them, scored or not. */
  practised: number
  /** The first clip with no take, which is where "continue" goes. Null once
   *  every clip has been practised at least once. */
  next: Video | null
}

/**
 * How far through a playlist a learner is.
 *
 * Practised means "has a take", not "scored well". Whether a delivery was any
 * good is what the score is for; this is about where you left off, and a clip
 * you recorded badly is still a clip you have been to.
 */
export function playlistProgress(
  clips: Video[],
  hasTake: (videoId: string) => boolean,
): PlaylistProgress {
  const practised = clips.filter((clip) => hasTake(clip.id))
  return {
    total: clips.length,
    practised: practised.length,
    next: clips.find((clip) => !hasTake(clip.id)) ?? null,
  }
}

/**
 * What an unnamed clip is called: "Clip 1", "Clip 2", and so on.
 *
 * "Clip" rather than "take" or "line", both of which already mean something
 * here: a take is a learner's recording, and a line is one caption inside a
 * clip — the Practice screen says "Line 1 of 1" within one. Clip is the thing
 * itself, and the word the studio already uses on screen.
 */
export function clipName(n: number): string {
  return `Clip ${n}`
}

const CLIP_NAME = /^clip\s+(\d+)$/i

/**
 * The number the next unnamed clip in a playlist should carry.
 *
 * Continues from the highest one already there rather than restarting at one.
 * Publishing an episode in a single batch is the common case and the two are
 * identical there; going back to cut a few more lines into the same playlist is
 * where restarting would give it a second "Take 1".
 *
 * Only names of exactly that shape count. A clip the admin named themselves is
 * not part of the sequence and should not push it along.
 */
export function nextClipNumber(videos: Video[], playlist: string): number {
  const used = videos
    .filter((video) => video.playlist === playlist)
    .map((video) => CLIP_NAME.exec(video.title.trim())?.[1])
    .filter((digits): digits is string => digits !== undefined)
    .map(Number)
  return used.length === 0 ? 1 : Math.max(...used) + 1
}
