import { measureTake, trackPitch, type TakeResult } from './measure'
import type { Contour } from './pitch'

export interface AnalyseRequest {
  id: number
  take: { samples: Float32Array; sampleRate: number }
  /** Samples may be omitted; the worker asks for them if it has not seen this key. */
  reference: { key: string; samples: Float32Array | null; sampleRate: number } | null
}

export interface AnalyseResponse {
  id: number
  result: TakeResult | null
  /** The worker does not hold this reference — send it again with samples. */
  needReference?: boolean
  error?: string
}

/** Tracking the source clip again for every take is wasted work; it does not change. */
let cached: { key: string; contour: Contour } | null = null

self.onmessage = (event: MessageEvent<AnalyseRequest>) => {
  const { id, take, reference } = event.data
  try {
    let referenceContour: Contour | null = null
    if (reference) {
      if (cached?.key === reference.key) {
        referenceContour = cached.contour
      } else if (reference.samples) {
        referenceContour = trackPitch(reference.samples, reference.sampleRate)
        cached = { key: reference.key, contour: referenceContour }
      } else {
        // Only the worker knows what it holds, so it asks rather than the
        // caller guessing — a stale guess would score against the wrong clip.
        self.postMessage({ id, result: null, needReference: true } satisfies AnalyseResponse)
        return
      }
    }
    const result = measureTake(take.samples, take.sampleRate, referenceContour)
    self.postMessage({ id, result } satisfies AnalyseResponse)
  } catch (error) {
    self.postMessage({ id, result: null, error: String(error) } satisfies AnalyseResponse)
  }
}
