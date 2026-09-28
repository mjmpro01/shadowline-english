import { useEffect, useState } from 'react'

/**
 * Where a media element is in its playback, every frame while it plays.
 *
 * `timeupdate` fires only a few times a second, which moves a line across a
 * strip in visible jumps; a frame loop keeps it smooth. The last position
 * holds while paused, so a learner who stops mid-line can see where, and it
 * clears when playback reaches the end.
 */
export function usePlayhead(media: HTMLMediaElement | null): number | null {
  const [time, setTime] = useState<number | null>(null)

  useEffect(() => {
    if (!media) return
    let frame = 0
    const tick = () => {
      setTime(media.currentTime)
      frame = requestAnimationFrame(tick)
    }
    const onPlay = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(tick)
    }
    const onPause = () => {
      cancelAnimationFrame(frame)
      setTime(media.ended ? null : media.currentTime)
    }
    const onEnded = () => {
      cancelAnimationFrame(frame)
      setTime(null)
    }
    // A new clip in the same element starts with no line on the strip.
    const onEmptied = onEnded
    media.addEventListener('play', onPlay)
    media.addEventListener('pause', onPause)
    media.addEventListener('ended', onEnded)
    media.addEventListener('emptied', onEmptied)
    return () => {
      cancelAnimationFrame(frame)
      media.removeEventListener('play', onPlay)
      media.removeEventListener('pause', onPause)
      media.removeEventListener('ended', onEnded)
      media.removeEventListener('emptied', onEmptied)
    }
  }, [media])

  return time
}
