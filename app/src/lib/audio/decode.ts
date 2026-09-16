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

/** Peak pairs per column, for drawing a waveform without plotting every sample. */
export function peaks(samples: Float32Array, columns: number): { min: number; max: number }[] {
  const perColumn = Math.max(1, Math.floor(samples.length / columns))
  const out: { min: number; max: number }[] = []
  for (let c = 0; c < columns; c++) {
    let min = 0
    let max = 0
    const from = c * perColumn
    for (let i = from; i < from + perColumn && i < samples.length; i++) {
      if (samples[i] < min) min = samples[i]
      if (samples[i] > max) max = samples[i]
    }
    out.push({ min, max })
  }
  return out
}
