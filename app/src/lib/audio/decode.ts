/** Decodes an uploaded file to mono at its own sample rate: the studio needs the
    waveform to cut on, and the audio it publishes has to stay listenable. */
export async function decodeFile(blob: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const bytes = await blob.arrayBuffer()
  const context = new AudioContext()
  let buffer: AudioBuffer
  try {
    buffer = await context.decodeAudioData(bytes)
  } finally {
    void context.close()
  }

  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
  const samples = new Float32Array(buffer.length)
  for (let i = 0; i < buffer.length; i++) {
    let sum = 0
    for (const channel of channels) sum += channel[i]
    samples[i] = sum / channels.length
  }
  return { samples, sampleRate: buffer.sampleRate }
}

export interface Column {
  min: number
  max: number
  /** Average energy of the column: how loud it is, not how far it reaches. */
  rms: number
}

/**
 * Column summaries for drawing a waveform without plotting every sample.
 *
 * min/max alone is enough for a short recording, where a column spans a few
 * milliseconds and the outline comes out spiky. It falls apart over a long one:
 * a column of a fifty-minute file covers seconds of continuous speech, every
 * column reaches the ceiling, and the waveform draws as a filled rectangle that
 * says nothing about where anyone is talking.
 *
 * rms keeps varying long after min/max has saturated — a pause, a quiet line
 * and a shout are three different numbers — so the editor draws the body of the
 * wave from it and keeps min/max as a faint outline.
 */
export function peaks(samples: Float32Array, columns: number): Column[] {
  const perColumn = Math.max(1, Math.floor(samples.length / columns))
  const out: Column[] = []
  for (let c = 0; c < columns; c++) {
    let min = 0
    let max = 0
    let sumSquares = 0
    let counted = 0
    const from = c * perColumn
    for (let i = from; i < from + perColumn && i < samples.length; i++) {
      const sample = samples[i]
      if (sample < min) min = sample
      if (sample > max) max = sample
      sumSquares += sample * sample
      counted++
    }
    // A column past the end of the samples has nothing in it; dividing by
    // counted would make it NaN and break the path it is drawn into.
    out.push({ min, max, rms: counted > 0 ? Math.sqrt(sumSquares / counted) : 0 })
  }
  return out
}
