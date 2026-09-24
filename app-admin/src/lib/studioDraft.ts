import type { Column } from './audio/decode'
import type { Segment } from './audio/segment'
import type { Transcript } from '../data/types'

/**
 * The recording the studio is in the middle of cutting.
 *
 * Kept here rather than in the studio's own state because leaving the screen
 * unmounts it, and everything went with it: the decoded file, the proposed
 * cuts, every line typed into them, the upload already on the server and the
 * transcript being waited for. Opening the library for ten seconds to check a
 * name meant starting a fifty-minute recording again.
 *
 * Nothing is persisted. The decoded samples are hundreds of megabytes and the
 * object URL belongs to this document, so neither survives a reload — this
 * carries the work across a screen, not across a session.
 */

export interface StudioLoaded {
  name: string
  samples: Float32Array
  sampleRate: number
  duration: number
  peaks: Column[]
  /** The original file, for the picture. The decoded samples carry only sound. */
  url: string
  file: File
  isVideo: boolean
}

export interface StudioLine {
  title: string
  text: string
  ipa: string
  categories: string
  include: boolean
}

export interface StudioDraft {
  loaded: StudioLoaded
  segments: Segment[]
  lines: StudioLine[]
  playlist: string
  batchCategories: string
  selected: number | null
  frames: (string | null)[]
  sourceId: string | null
  sourceUploading: boolean
  transcript: Transcript | null
  /**
   * The upload started when the file was opened. A promise rather than a flag:
   * publishing waits on it for the id the cutter needs, and that wait has to
   * survive the screen too or a publish after coming back would skip the cut.
   */
  upload: Promise<string | null>
  /** The url whose filmstrip has already been walked, so coming back does not
   *  seek through the whole file again for frames that are already on screen. */
  walked: string | null
}

let draft: StudioDraft | null = null

export function readDraft(): StudioDraft | null {
  return draft
}

export function saveDraft(next: StudioDraft | null): void {
  draft = next
}
