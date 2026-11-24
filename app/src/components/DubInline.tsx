import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { Icon } from './Icon'

/**
 * The clip with the learner's own voice over it, played where the clip itself
 * plays — so straight after a take they can watch their line against the
 * picture without leaving Practice for Dub Review.
 *
 * The take's audio is the clock and the picture follows it, as on Dub Review:
 * which voice is heard is the point, and a muted video can be nudged to where
 * the sound is without anyone hearing the nudge. `attach` hands the audio to
 * the screen, so the playhead on the wave under it follows the dub too.
 */
export function DubInline({
  videoUrl,
  takeUrl,
  attach,
}: {
  videoUrl: string | null
  takeUrl: string | null
  attach: (element: HTMLMediaElement | null) => void
}) {
  const t = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  const setAudio = useCallback(
    (element: HTMLAudioElement | null) => {
      audioRef.current = element
      attach(element)
    },
    [attach],
  )

  // Leaving the dub (or a new take replacing it) stops both, rather than
  // leaving the picture running with no sound behind it.
  useEffect(() => {
    const picture = videoRef.current
    const sound = audioRef.current
    return () => {
      picture?.pause()
      sound?.pause()
    }
  }, [takeUrl])

  /** Moves the picture to where the sound is, once they drift apart by more
   *  than a fifth of a second: setting it every tick makes the video stutter. */
  const follow = (force = false) => {
    const picture = videoRef.current
    const sound = audioRef.current
    if (!picture || !sound) return
    if (force || Math.abs(picture.currentTime - sound.currentTime) > 0.2) {
      picture.currentTime = Math.min(sound.currentTime, picture.duration || sound.currentTime)
    }
  }

  const toggle = () => {
    const sound = audioRef.current
    if (!sound) return
    if (playing) {
      sound.pause()
      return
    }
    if (sound.ended || (sound.duration && sound.currentTime >= sound.duration)) sound.currentTime = 0
    void sound.play()
  }

  return (
    <>
      {videoUrl && (
        <video
          ref={videoRef}
          className="clip-video"
          src={videoUrl}
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          data-testid="dub-inline-video"
        />
      )}
      {takeUrl && (
        <audio
          ref={setAudio}
          src={takeUrl}
          preload="auto"
          data-testid="dub-inline-audio"
          onPlay={() => {
            setPlaying(true)
            follow(true)
            void videoRef.current?.play()
          }}
          onPause={() => {
            setPlaying(false)
            videoRef.current?.pause()
          }}
          onEnded={() => {
            setPlaying(false)
            videoRef.current?.pause()
          }}
          onSeeked={() => follow(true)}
          onTimeUpdate={() => follow()}
        />
      )}
      <span className="tag tag-neutral dub-inline-tag">
        <Icon name="mic" size={12} />
        {t('practice.dubInlineTag')}
      </span>
      <button
        type="button"
        className="btn btn-primary dub-inline-play"
        onClick={toggle}
        disabled={!takeUrl}
        aria-label={playing ? t('practice.dubInlinePause') : t('practice.dubInlinePlay')}
      >
        <Icon name={playing ? 'square' : 'play'} size={16} />
        {playing ? t('practice.dubInlinePause') : t('practice.dubInlinePlay')}
      </button>
    </>
  )
}
