import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_CLIP_SECONDS } from '../data/types'

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'denied' | 'unsupported'

const BAR_COUNT = 30

interface RecorderSession {
  stream: MediaStream
  recorder: MediaRecorder
  context: AudioContext
  chunks: Blob[]
  meter: number
}

/**
 * Real microphone capture, with the loudness bars measured from the live signal.
 *
 * Recording stops itself at the clip limit — a take is one line, and a runaway
 * recording is never what the learner wanted — so the finished recording is
 * handed back through `onComplete` rather than returned from `stop`: the
 * caller should not care which of the two ended it.
 */
export function useRecorder({
  onComplete,
}: { onComplete?: (recording: Blob | null, levels: number[]) => void } = {}) {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [levels, setLevels] = useState<number[]>([])
  const [elapsed, setElapsed] = useState(0)
  const session = useRef<RecorderSession | null>(null)
  const levelsRef = useRef<number[]>([])
  const complete = useRef(onComplete)

  useEffect(() => {
    complete.current = onComplete
  }, [onComplete])

  const teardown = useCallback(() => {
    const active = session.current
    if (!active) return
    window.clearInterval(active.meter)
    active.stream.getTracks().forEach((track) => track.stop())
    void active.context.close()
    session.current = null
  }, [])

  useEffect(() => teardown, [teardown])

  const stop = useCallback(async () => {
    const active = session.current
    if (!active) return
    const recording = await new Promise<Blob>((resolve) => {
      active.recorder.onstop = () => resolve(new Blob(active.chunks, { type: active.recorder.mimeType }))
      active.recorder.stop()
    })
    teardown()
    setStatus('idle')
    complete.current?.(recording, levelsRef.current)
  }, [teardown])

  const stopRef = useRef(stop)
  useEffect(() => {
    stopRef.current = stop
  }, [stop])

  const start = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      return false
    }
    setStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      context.createMediaStreamSource(stream).connect(analyser)
      const buffer = new Uint8Array(analyser.frequencyBinCount)

      const chunks: Blob[] = []
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data)
      }
      recorder.start()

      levelsRef.current = []
      setLevels([])
      setElapsed(0)
      const startedAt = performance.now()
      let reachedLimit = false
      const meter = window.setInterval(() => {
        analyser.getByteTimeDomainData(buffer)
        let sum = 0
        for (const sample of buffer) sum += (sample - 128) ** 2
        const rms = Math.sqrt(sum / buffer.length) / 128
        levelsRef.current = [...levelsRef.current, Math.min(1, rms * 2.4)].slice(-BAR_COUNT)
        setLevels(levelsRef.current)
        const seconds = (performance.now() - startedAt) / 1000
        setElapsed(seconds)
        if (seconds >= MAX_CLIP_SECONDS && !reachedLimit) {
          reachedLimit = true
          void stopRef.current()
        }
      }, 90)

      session.current = { stream, recorder, context, chunks, meter }
      setStatus('recording')
      return true
    } catch {
      setStatus('denied')
      return false
    }
  }, [])

  const reset = useCallback(() => {
    teardown()
    levelsRef.current = []
    setLevels([])
    setElapsed(0)
    setStatus('idle')
  }, [teardown])

  return { status, levels, elapsed, start, stop, reset }
}
