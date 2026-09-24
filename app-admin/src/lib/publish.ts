import { MAX_CLIP_SECONDS } from '../data/types'
import { repository } from '../repository'
import { clipName } from './clips'
import { clock } from './time'

/** Clips per create request. The server refuses a body over a megabyte, which a
 *  batch of about two thousand clips reaches; two hundred leaves room and gives
 *  the studio something to count. */
const CREATE_BATCH = 200

/** Audio uploads in flight at once. The browser runs six requests to a host, so
 *  more than this only builds a queue nobody can see; fewer makes a long batch
 *  slower than it has to be. */
const AUDIO_AT_ONCE = 4

/** One cut, ready to publish. */
export interface NewClip {
  /** What the library shows; falls back to a number when left empty. */
  title: string
  line: string
  ipa: string
  source: string
  playlist: string
  categories: string[]
  start: number
  end: number
  audio: Blob
}

/**
 * How far publishing has got, for the screen to say so.
 *
 * Publishing a long recording is hundreds of requests and hundreds of megabytes
 * of audio. It used to be one unlabelled "Saving…" for all of it, which is
 * indistinguishable from a studio that has hung.
 */
export interface PublishProgress {
  /** 'clips' while the rows are being written, 'audio' while their sound goes up. */
  stage: 'clips' | 'audio'
  done: number
  total: number
}

export interface PublishResult {
  published: number
  /**
   * Clips that are in the library with no sound of their own.
   *
   * Not a thrown error: the clips exist and are worth having, and a take
   * recorded against one is kept and measured, only not scored. Saying nothing
   * would be worse — this is what the studio reports so the admin can put the
   * audio back rather than discovering it from a learner.
   */
  withoutAudio: number
}

/**
 * Publishes a batch: the rows, then their audio.
 *
 * This was a method on the learner app's store, because publishing had to push
 * the new clips into the array that app held. Nothing here holds a library — the
 * clip manager pages the server — so it is a function.
 */
export async function publishClips(
  clips: NewClip[],
  sourceId?: string | null,
  onProgress?: (at: PublishProgress) => void,
): Promise<PublishResult> {
  // A clip is one line: nothing longer is sent, whatever the studio's UI allowed
  // while the cuts were being adjusted. The server checks too.
  const withinLimit = clips.filter((c) => c.end - c.start <= MAX_CLIP_SECONDS + 0.01)
  if (withinLimit.length === 0) return { published: 0, withoutAudio: 0 }

  // Unnamed clips are numbered across the batch, continuing from whatever the
  // playlist already holds. Asked of the server: it is a fact about the
  // playlist, and two admins publishing to one playlist at once would otherwise
  // both count the same thing and both start from it.
  const playlist = withinLimit[0]?.playlist ?? ''
  const firstNumber = await repository.nextClipNumber(playlist)

  // In lots rather than all at once. A fifty-minute recording proposes hundreds
  // of cuts, and the whole batch in one request is a body the server refuses
  // past a megabyte — which reads, from the studio, as publishing simply not
  // working.
  const created: { id: string }[] = []
  for (let from = 0; from < withinLimit.length; from += CREATE_BATCH) {
    const lot = withinLimit.slice(from, from + CREATE_BATCH)
    created.push(
      ...(await repository.createClips(
        lot.map((clip, index) => ({
          title: clip.title || clipName(firstNumber + from + index),
          source: clip.source,
          playlist: clip.playlist,
          categories: clip.categories,
          timestamp: `${clock(clip.start)}–${clock(clip.end)}`,
          durationSeconds: clip.end - clip.start,
          summary: 'No takes recorded yet — practice this clip to see your pitch analysis.',
          captions: [{ text: clip.line, ipa: clip.ipa }],
          sourceId: sourceId ?? undefined,
          startSeconds: clip.start,
          endSeconds: clip.end,
        })),
      )),
    )
    onProgress?.({ stage: 'clips', done: created.length, total: withinLimit.length })
  }

  // Audio goes up per clip, after the ids exist, a few at a time.
  //
  // It was every clip at once. The browser only runs six requests to a host
  // anyway, so the rest sat in a queue nothing could see, and one rejection
  // abandoned the others with the clips already published — which is how a batch
  // ends up half in the library with no word about it.
  let done = 0
  let withoutAudio = 0
  const queue = created.map((clip, index) => ({ id: clip.id, audio: withinLimit[index].audio }))
  const workers = Array.from({ length: Math.min(AUDIO_AT_ONCE, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        await repository.uploadClipAudio(next.id, next.audio)
      } catch {
        withoutAudio++
      }
      onProgress?.({ stage: 'audio', done: ++done, total: created.length })
    }
  })
  await Promise.all(workers)

  return { published: created.length, withoutAudio }
}
