/**
 * Still frames from a video file, taken at even intervals across it.
 *
 * A browser will not hand over a frame except by seeking to it and drawing it,
 * and every seek is a round trip through the decoder. A fifty-minute file takes
 * seconds to walk, so frames are reported one at a time through `onFrame`
 * rather than returned together at the end: the strip fills in as it goes
 * instead of showing nothing until it is done.
 */

export interface Frame {
  /** Which slot on the strip this fills — slot i covers i/count of the run. */
  index: number
  src: string
}

/** Long enough for a decoder to reach a distant keyframe, short enough that one
 *  unreachable position does not hold up the rest of the strip. */
const SEEK_TIMEOUT_MS = 4000

export async function extractFrames({
  url,
  duration,
  count,
  height = 44,
  onFrame,
  signal,
}: {
  url: string
  duration: number
  count: number
  height?: number
  onFrame: (frame: Frame) => void
  signal: AbortSignal
}): Promise<void> {
  if (count <= 0 || duration <= 0) return

  const video = document.createElement('video')
  video.preload = 'auto'
  // Muted and detached: this one is a frame source, not a player, and an
  // unmuted seek would talk over the one the person is actually listening to.
  video.muted = true
  video.playsInline = true
  video.src = url

  try {
    await once(video, 'loadeddata', signal)
    // An audio file in a video container has no picture to take. Nothing is
    // wrong; there is simply no strip to draw.
    if (!video.videoWidth || !video.videoHeight) return

    const canvas = document.createElement('canvas')
    canvas.height = height
    canvas.width = Math.max(1, Math.round((video.videoWidth / video.videoHeight) * height))
    const context = canvas.getContext('2d')
    if (!context) return

    for (let index = 0; index < count; index++) {
      if (signal.aborted) return
      // The middle of the slot, not its edge: a frame taken exactly on a cut
      // belongs to neither side of it.
      const time = ((index + 0.5) / count) * duration
      try {
        await seek(video, Math.min(time, Math.max(0, duration - 0.05)), signal)
      } catch {
        // One position the decoder will not reach is not worth abandoning the
        // rest of the strip over — leave the slot empty and carry on.
        continue
      }
      if (signal.aborted) return
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      onFrame({ index, src: canvas.toDataURL('image/jpeg', 0.6) })
    }
  } catch {
    // A file the browser cannot open as video leaves the timeline exactly as it
    // is without one, which is the state every audio upload is already in.
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

function once(target: HTMLVideoElement, event: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'))
    const done = () => {
      cleanup()
      resolve()
    }
    const fail = () => {
      cleanup()
      reject(new Error(`${event} failed`))
    }
    const cleanup = () => {
      target.removeEventListener(event, done)
      target.removeEventListener('error', fail)
      signal.removeEventListener('abort', fail)
    }
    target.addEventListener(event, done, { once: true })
    target.addEventListener('error', fail, { once: true })
    signal.addEventListener('abort', fail, { once: true })
  })
}

function seek(video: HTMLVideoElement, time: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(fail, SEEK_TIMEOUT_MS)
    function done() {
      cleanup()
      resolve()
    }
    function fail() {
      cleanup()
      reject(new Error('seek failed'))
    }
    function cleanup() {
      clearTimeout(timer)
      video.removeEventListener('seeked', done)
      video.removeEventListener('error', fail)
      signal.removeEventListener('abort', fail)
    }
    video.addEventListener('seeked', done, { once: true })
    video.addEventListener('error', fail, { once: true })
    signal.addEventListener('abort', fail, { once: true })
    video.currentTime = time
  })
}
