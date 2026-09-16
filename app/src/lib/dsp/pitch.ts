/**
 * Pitch tracking for recorded speech.
 *
 * YIN (de Cheveigné & Kawahara 2002): difference function, cumulative mean
 * normalised difference, absolute threshold, then parabolic interpolation of
 * the chosen lag. Frames are 40ms every 10ms, which is fine for the sentence
 * level contours this app compares — it is not trying to be a formant-accurate
 * analyser.
 */

export const FRAME_MS = 40
export const HOP_MS = 10
/** Speech F0 tops out around 400Hz, so analysing at 8kHz keeps every harmonic
    that matters and costs a quarter of what 16kHz does in the difference loop. */
export const ANALYSIS_RATE = 8000
const F0_MIN = 60
const F0_MAX = 400
const YIN_THRESHOLD = 0.15
/** Below this frame RMS there is no speech to measure. */
const SILENCE_RMS = 0.006

export interface Frame {
  /** Seconds from the start of the recording. */
  time: number
  /** Fundamental in Hz, or null when the frame is unvoiced or silent. */
  hz: number | null
  rms: number
}

export interface Contour {
  frames: Frame[]
  /** Median voiced F0 — each speaker's own register, used as the semitone origin. */
  medianHz: number
  duration: number
}

/** Decodes any browser-supported audio blob to mono 16kHz samples. */
export async function decodeToMono(blob: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const bytes = await blob.arrayBuffer()
  // decodeAudioData needs a plain AudioContext; OfflineAudioContext resamples for us.
  const probe = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await probe.decodeAudioData(bytes)
  } finally {
    void probe.close()
  }

  const offline = new OfflineAudioContext(1, Math.ceil((decoded.duration * ANALYSIS_RATE) || 1), ANALYSIS_RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()
  return { samples: rendered.getChannelData(0), sampleRate: ANALYSIS_RATE }
}

function yinFrame(frame: Float32Array, sampleRate: number): number | null {
  const maxLag = Math.min(Math.floor(sampleRate / F0_MIN), Math.floor(frame.length / 2))
  const minLag = Math.max(2, Math.floor(sampleRate / F0_MAX))
  if (maxLag <= minLag) return null

  const diff = new Float32Array(maxLag + 1)
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0
    for (let i = 0; i + lag < frame.length; i++) {
      const d = frame[i] - frame[i + lag]
      sum += d * d
    }
    diff[lag] = sum
  }

  // Cumulative mean normalised difference: makes the threshold scale-free.
  const cmnd = new Float32Array(maxLag + 1)
  cmnd[0] = 1
  let running = 0
  for (let lag = 1; lag <= maxLag; lag++) {
    running += diff[lag]
    cmnd[lag] = running === 0 ? 1 : (diff[lag] * lag) / running
  }

  let chosen = -1
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (cmnd[lag] < YIN_THRESHOLD) {
      // Walk to the local minimum of this dip rather than taking its first edge.
      while (lag + 1 <= maxLag && cmnd[lag + 1] < cmnd[lag]) lag++
      chosen = lag
      break
    }
  }
  if (chosen === -1) {
    let best = minLag
    for (let lag = minLag; lag <= maxLag; lag++) if (cmnd[lag] < cmnd[best]) best = lag
    if (cmnd[best] > 0.35) return null
    chosen = best
  }

  // Parabolic interpolation around the minimum for sub-sample lag accuracy.
  const prev = cmnd[chosen - 1] ?? cmnd[chosen]
  const next = cmnd[chosen + 1] ?? cmnd[chosen]
  const denom = 2 * (2 * cmnd[chosen] - prev - next)
  const shift = denom === 0 ? 0 : (next - prev) / denom
  const hz = sampleRate / (chosen + shift)
  return hz >= F0_MIN && hz <= F0_MAX ? hz : null
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function trackPitch(samples: Float32Array, sampleRate: number): Contour {
  const frameLength = Math.round((FRAME_MS / 1000) * sampleRate)
  const hop = Math.round((HOP_MS / 1000) * sampleRate)
  const frames: Frame[] = []

  for (let start = 0; start + frameLength <= samples.length; start += hop) {
    const frame = samples.subarray(start, start + frameLength)
    let energy = 0
    for (const sample of frame) energy += sample * sample
    const rms = Math.sqrt(energy / frame.length)
    frames.push({
      time: start / sampleRate,
      hz: rms < SILENCE_RMS ? null : yinFrame(frame, sampleRate),
      rms,
    })
  }

  smoothOctaveJumps(frames)

  return {
    frames,
    medianHz: median(frames.filter((f) => f.hz !== null).map((f) => f.hz as number)),
    duration: samples.length / sampleRate,
  }
}

/** YIN occasionally locks onto a harmonic; snap lone frames back beside their neighbours. */
function smoothOctaveJumps(frames: Frame[]): void {
  for (let i = 1; i < frames.length - 1; i++) {
    const { hz } = frames[i]
    const before = frames[i - 1].hz
    const after = frames[i + 1].hz
    if (hz === null || before === null || after === null) continue
    const neighbour = (before + after) / 2
    for (const factor of [2, 0.5]) {
      if (Math.abs(hz * factor - neighbour) < Math.abs(hz - neighbour) * 0.5) {
        frames[i] = { ...frames[i], hz: hz * factor }
        break
      }
    }
  }
}

export function toSemitones(hz: number, referenceHz: number): number {
  return 12 * Math.log2(hz / referenceHz)
}

/** Voiced frames as semitones around the speaker's own median. */
export function semitoneTrack(contour: Contour): { time: number; semitone: number; rms: number }[] {
  if (!contour.medianHz) return []
  return contour.frames
    .filter((f) => f.hz !== null)
    .map((f) => ({
      time: f.time,
      semitone: toSemitones(f.hz as number, contour.medianHz),
      rms: f.rms,
    }))
}

export async function analyseBlob(blob: Blob): Promise<Contour> {
  const { samples, sampleRate } = await decodeToMono(blob)
  return trackPitch(samples, sampleRate)
}
