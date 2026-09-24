import type { Video } from '../data/types'

/** Categories are typed as a comma-separated list and stored as tags. */
export function parseCategories(input: string): string[] {
  return [...new Set(input.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean))]
}

export function formatCategories(categories: string[]): string {
  return categories.join(', ')
}

export interface EpisodeProgress {
  total: number
  /** How many have a take against them, scored or not. */
  practised: number
  /** The first clip with no take, which is where "continue" goes. Null once
   *  every clip has been practised at least once. */
  next: Video | null
}

/**
 * How far through an episode a learner is.
 *
 * Practised means "has a take", not "scored well". Whether a delivery was any
 * good is what the score is for; this is about where you left off, and a clip
 * you recorded badly is still a clip you have been to.
 */
export function episodeProgress(
  clips: Video[],
  hasTake: (clipId: string) => boolean,
): EpisodeProgress {
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
