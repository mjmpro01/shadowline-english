import { useState } from 'react'
import type { Video } from '../data/types'
import { useT } from '../i18n'
import { urlOf, useClipAudio, useClipVideo } from '../lib/useAudioUrl'
import { Icon } from './Icon'

/**
 * A clip to watch before writing it down, and nothing to read: a still and a
 * play button, and on a press the clip itself — the cut of the video where
 * there is one, the sound where there is not. No captions, which would give
 * the passage away before it has been heard.
 *
 * Its address is asked for only on the press: an episode can have a hundred
 * lines, and a hundred signed URLs fetched to show a hundred stills nobody
 * plays is a hundred requests for nothing.
 */
export function ClipPreview({ clip, label }: { clip: Video; label: string }) {
  const t = useT()
  const [playing, setPlaying] = useState(false)
  return (
    <div className="clip-preview">
      {playing ? (
        <Playing clip={clip} />
      ) : (
        <button
          type="button"
          className="clip-preview-face"
          aria-label={`${t('dictation.preview')} — ${label}`}
          onClick={() => setPlaying(true)}
        >
          {clip.posterUrl && <img src={clip.posterUrl} alt="" loading="lazy" />}
          <span className="clip-preview-play">
            <Icon name="play" size={18} />
          </span>
        </button>
      )}
    </div>
  )
}

function Playing({ clip }: { clip: Video }) {
  const video = useClipVideo(clip.hasVideo ? clip.id : null)
  const audio = useClipAudio(clip.id)
  const videoUrl = urlOf(video)
  if (videoUrl) {
    return <video className="clip-preview-media" src={videoUrl} controls autoPlay playsInline />
  }
  const audioUrl = video.status === 'loading' ? null : urlOf(audio)
  if (audioUrl) {
    return (
      <div className="clip-preview-face" data-audio="">
        <audio src={audioUrl} controls autoPlay />
      </div>
    )
  }
  return <div className="clip-preview-face" aria-busy="true" />
}
