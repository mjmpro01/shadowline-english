/**
 * Proposes where to cut a recording into single lines.
 *
 * Speech is split at the pauses between sentences rather than on a fixed grid,
 * because a clip cut mid-word is useless to shadow. The proposal is a starting
 * point: the admin screen lets those boundaries be moved.
 */

const FRAME_MS = 20

export interface Segment {
  start: number
  end: number
}

export interface SegmentOptions {
  /** Longest a clip may be; anything longer is split again. */
  maxSeconds: number
  /** Shorter than this is not a line, so it is merged into a neighbour. */
  minSeconds?: number
  /** Silence this long reads as a break between lines. */
  minPauseSeconds?: number
}

function rmsEnvelope(samples: Float32Array, sampleRate: number): { frame: number; values: Float32Array } {
  const frame = Math.max(1, Math.round((FRAME_MS / 1000) * sampleRate))
  const count = Math.floor(samples.length / frame)
  const values = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    let sum = 0
    for (let j = 0; j < frame; j++) {
      const sample = samples[i * frame + j]
      sum += sample * sample
    }
    values[i] = Math.sqrt(sum / frame)
  }
  return { frame, values }
}

function percentile(values: Float32Array, p: number): number {
  if (!values.length) return 0
  const sorted = Float32Array.from(values).sort()
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

/** Splits a stretch that is still too long, preferring its quietest moment. */
function splitLong(segment: Segment, envelope: Float32Array, frameSeconds: number, max: number): Segment[] {
  if (segment.end - segment.start <= max) return [segment]

  const from = Math.floor(segment.start / frameSeconds)
  const to = Math.floor(segment.end / frameSeconds)
  // Look for the quietest frame in the middle half, so the cut is not made
  // right next to an existing boundary.
  const searchFrom = from + Math.floor((to - from) * 0.25)
  const searchTo = from + Math.ceil((to - from) * 0.75)
  let quietest = searchFrom
  for (let i = searchFrom; i < searchTo; i++) {
    if (envelope[i] < envelope[quietest]) quietest = i
  }
  const cut = quietest * frameSeconds

  return [
    ...splitLong({ start: segment.start, end: cut }, envelope, frameSeconds, max),
    ...splitLong({ start: cut, end: segment.end }, envelope, frameSeconds, max),
  ]
}

export function proposeSegments(
  samples: Float32Array,
  sampleRate: number,
  { maxSeconds, minSeconds = 0.8, minPauseSeconds = 0.18 }: SegmentOptions,
): Segment[] {
  const { frame, values } = rmsEnvelope(samples, sampleRate)
  if (!values.length) return []
  const frameSeconds = frame / sampleRate

  // Anything close to the quietest part of the recording is the room, not speech.
  const floor = percentile(values, 0.1)
  let peak = 0
  for (const value of values) peak = Math.max(peak, value)
  const threshold = Math.max(floor * 3, peak * 0.06, 1e-4)

  const pauseFrames = Math.max(1, Math.round(minPauseSeconds / frameSeconds))
  const speech: Segment[] = []
  let runStart: number | null = null
  let quietFor = 0

  values.forEach((value, i) => {
    if (value >= threshold) {
      runStart ??= i
      quietFor = 0
      return
    }
    if (runStart === null) return
    quietFor++
    if (quietFor >= pauseFrames) {
      speech.push({ start: runStart * frameSeconds, end: (i - quietFor + 1) * frameSeconds })
      runStart = null
      quietFor = 0
    }
  })
  if (runStart !== null) speech.push({ start: runStart * frameSeconds, end: values.length * frameSeconds })

  const capped = speech.flatMap((segment) => splitLong(segment, values, frameSeconds, maxSeconds))

  // A fragment on its own is not a line: fold it into the neighbour it fits.
  const merged: Segment[] = []
  for (const segment of capped) {
    const previous = merged[merged.length - 1]
    const tooShort = segment.end - segment.start < minSeconds
    if (tooShort && previous && segment.end - previous.start <= maxSeconds) {
      previous.end = segment.end
    } else {
      merged.push({ ...segment })
    }
  }
  return merged.filter((segment) => segment.end - segment.start >= Math.min(minSeconds, 0.3))
}
