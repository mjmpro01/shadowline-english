import { useCallback, useEffect, useRef, useState } from 'react'

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
 * Real microphone capture. The loudness bars below are measured from the live
 * signal; the pronunciation score the Practice screen shows afterwards is
 * still a stand-in until the pitch pipeline lands.
 */
export function useRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [levels, setLevels] = useState<number[]>([])
  const session = useRef<RecorderSession | null>(null)

  const teardown = useCallback(() => {
    const active = session.current
    if (!active) return
    window.clearInterval(active.meter)
    active.stream.getTracks().forEach((track) => track.stop())
    void active.context.close()
    session.current = null
  }, [])

  useEffect(() => teardown, [teardown])

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

      setLevels([])
      const meter = window.setInterval(() => {
        analyser.getByteTimeDomainData(buffer)
        let sum = 0
        for (const sample of buffer) sum += (sample - 128) ** 2
        const rms = Math.sqrt(sum / buffer.length) / 128
        setLevels((prev) => [...prev, Math.min(1, rms * 2.4)].slice(-BAR_COUNT))
      }, 90)

      session.current = { stream, recorder, context, chunks, meter }
      setStatus('recording')
      return true
    } catch {
      setStatus('denied')
      return false
    }
  }, [])

  const stop = useCallback(async (): Promise<Blob | null> => {
    const active = session.current
    if (!active) return null
    const blob = await new Promise<Blob>((resolve) => {
      active.recorder.onstop = () => resolve(new Blob(active.chunks, { type: active.recorder.mimeType }))
      active.recorder.stop()
    })
    teardown()
    setStatus('idle')
    return blob
  }, [teardown])

  const reset = useCallback(() => {
    teardown()
    setLevels([])
    setStatus('idle')
  }, [teardown])

  return { status, levels, start, stop, reset }
}
