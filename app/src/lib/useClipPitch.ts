import { useEffect, useState } from 'react'
import type { ContourPoint } from '../data/types'
import { ANALYSIS_RATE, semitoneTrack, trackPitch } from './dsp/pitch'

const ENVELOPE_COLUMNS = 120

export type ClipPitch =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; points: ContourPoint[]; envelope: number[]; duration: number }
  | { status: 'none' }
  | { status: 'error' }

/**
 * Pitch contour + amplitude envelope of the clip's source audio.
 *
 * Same YIN tracker the scorer uses on the reference, so what the learner sees
 * while practising is what they will later be scored against. The envelope is
 * the purple filled waveform under the pitch line — emphasis the ear hears as
 * louder lands as taller peaks.
 */
export function useClipPitch(audioUrl: string | null): ClipPitch {
  const [resolved, setResolved] = useState<{ url: string; value: ClipPitch } | null>(null)

  useEffect(() => {
    if (!audioUrl) return
    let active = true
    setResolved({ url: audioUrl, value: { status: 'loading' } })

    void (async () => {
      try {
        const samples = await decodeMonoAtRate(audioUrl, ANALYSIS_RATE)
        if (!active) return
        if (samples.length === 0) {
          setResolved({ url: audioUrl, value: { status: 'none' } })
          return
        }
        const contour = trackPitch(samples, ANALYSIS_RATE)
        const track = semitoneTrack(contour)
        const envelope = amplitudeEnvelope(samples, ENVELOPE_COLUMNS)
        if (track.length < 2 && envelope.every((v) => v < 0.02)) {
          setResolved({ url: audioUrl, value: { status: 'none' } })
          return
        }
        const points: ContourPoint[] = track.map((p) => ({ t: p.time, s: p.semitone }))
        setResolved({
          url: audioUrl,
          value: { status: 'ready', points, envelope, duration: contour.duration },
        })
      } catch {
        if (active) setResolved({ url: audioUrl, value: { status: 'error' } })
      }
    })()

    return () => {
      active = false
    }
  }, [audioUrl])

  if (!audioUrl) return { status: 'idle' }
  return resolved?.url === audioUrl ? resolved.value : { status: 'loading' }
}

/** Column RMS peaks across the clip, normalised to 0..1. */
function amplitudeEnvelope(samples: Float32Array, columns: number): number[] {
  if (!samples.length) return []
  const out = new Array<number>(columns).fill(0)
  const bucket = Math.max(1, Math.floor(samples.length / columns))
  let peak = 0
  for (let c = 0; c < columns; c++) {
    const start = c * bucket
    const end = Math.min(samples.length, start + bucket)
    let energy = 0
    for (let i = start; i < end; i++) energy += samples[i] * samples[i]
    const rms = Math.sqrt(energy / Math.max(1, end - start))
    out[c] = rms
    if (rms > peak) peak = rms
  }
  if (peak <= 0) return out
  return out.map((v) => Math.min(1, v / peak))
}

/** Fetches, decodes, mixes to mono, and resamples to the analysis rate. */
async function decodeMonoAtRate(url: string, targetRate: number): Promise<Float32Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`audio fetch ${response.status}`)
  const raw = await response.arrayBuffer()
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(raw.slice(0))
    const length = decoded.length
    const mono = new Float32Array(length)
    const channels = decoded.numberOfChannels
    for (let c = 0; c < channels; c++) {
      const data = decoded.getChannelData(c)
      for (let i = 0; i < length; i++) mono[i] += data[i] / channels
    }
    if (decoded.sampleRate === targetRate) return mono

    const duration = length / decoded.sampleRate
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(duration * targetRate)), targetRate)
    const buffer = offline.createBuffer(1, length, decoded.sampleRate)
    buffer.copyToChannel(mono, 0)
    const source = offline.createBufferSource()
    source.buffer = buffer
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    return rendered.getChannelData(0).slice()
  } finally {
    void context.close()
  }
}
