import { decodeToMono } from './pitch'
import type { AnalyseRequest, AnalyseResponse } from './analyse.worker'
import type { TakeResult } from './measure'

export type { TakeResult }

export interface ReferenceSource {
  key: string
  /** Only called when the worker does not already hold this reference. */
  load: () => Promise<Blob | null>
}

let worker: Worker | null = null
let nextId = 1

function getWorker(): Worker {
  worker ??= new Worker(new URL('./analyse.worker.ts', import.meta.url), { type: 'module' })
  return worker
}

function run(request: AnalyseRequest, transfer: Transferable[] = []): Promise<AnalyseResponse> {
  const instance = getWorker()
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent<AnalyseResponse>) => {
      if (event.data.id !== request.id) return
      instance.removeEventListener('message', onMessage)
      resolve(event.data)
    }
    instance.addEventListener('message', onMessage)
    instance.postMessage(request, transfer)
  })
}

/**
 * Measures a recorded take, scoring it against the clip's original audio when
 * the learner has attached one. Without a reference we still keep the measured
 * contour — it is real data — but we do not invent a match score for it.
 *
 * Decoding stays here because Web Audio is main-thread only; the arithmetic
 * that follows runs in a worker, which holds onto the source clip's contour so
 * it is tracked once rather than once per take.
 */
export async function analyseTake(takeBlob: Blob, reference: ReferenceSource | null): Promise<TakeResult | null> {
  let take: { samples: Float32Array; sampleRate: number }
  try {
    take = await decodeToMono(takeBlob)
  } catch {
    return null
  }

  // Ask without the samples first: the worker usually still holds this clip.
  // The take's buffer is copied rather than transferred so that a miss does
  // not cost a second decode.
  const first = await run({
    id: nextId++,
    take,
    reference: reference ? { key: reference.key, samples: null, sampleRate: 0 } : null,
  })
  if (!first.needReference || !reference) return first.error ? null : first.result

  const blob = await reference.load()
  if (!blob) return null

  let decodedReference: { samples: Float32Array; sampleRate: number }
  try {
    decodedReference = await decodeToMono(blob)
  } catch {
    return null
  }

  const second = await run(
    {
      id: nextId++,
      take,
      reference: {
        key: reference.key,
        samples: decodedReference.samples,
        sampleRate: decodedReference.sampleRate,
      },
    },
    [decodedReference.samples.buffer],
  )
  return second.error ? null : second.result
}
