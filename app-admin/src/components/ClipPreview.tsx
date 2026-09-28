import { useState } from 'react'
import type { Video } from '../data/types'
import { useT } from '../i18n'
import { iconFor, tintOf } from '../lib/clipFace'
import { clock } from '../lib/time'
import { repository } from '../repository'
import { Icon } from './Icon'

/** How much of the line the face shows, as in the learner app. */
const WORDS = 7

/**
 * A clip as a learner sees it in the app: the still, or the tint and topic
 * picture with the opening of the line; the length; the title and the line
 * under it. Beside it, what a learner would not see but an admin needs to —
 * whether its sound and picture are there yet — and a way to hear it and to
 * open it in the app.
 */
export function ClipPreview({ clip, index }: { clip: Video; index: number }) {
  const t = useT()
  const [media, setMedia] = useState<{ kind: 'video' | 'audio'; url: string } | 'none' | null>(null)
  const [loading, setLoading] = useState(false)
  const line = clip.captions[0]?.text ?? ''
  const words = line.trim().split(/\s+/).filter(Boolean)

  const play = async () => {
    setLoading(true)
    try {
      // The picture when it has been cut, the sound otherwise — what the
      // practice screen would play.
      if (clip.hasVideo && !clip.videoPending) {
        const { url } = await repository.clipVideo(clip.id)
        if (url) return setMedia({ kind: 'video', url })
      }
      const { url } = await repository.clipAudio(clip.id)
      setMedia(url ? { kind: 'audio', url } : 'none')
    } catch {
      setMedia('none')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card clip-preview">
      <div className="clip-preview-thumb">
        {clip.posterUrl ? (
          <img className="thumb-poster" src={clip.posterUrl} alt="" loading="lazy" />
        ) : (
          <span className="thumb-face" style={{ background: tintOf(clip.id) }}>
            <span className="thumb-face-icon" aria-hidden="true">
              {iconFor(clip.categories)}
            </span>
            {words.length > 0 && (
              <span className="thumb-face-line">
                {words.slice(0, WORDS).join(' ')}
                {words.length > WORDS ? '…' : ''}
              </span>
            )}
          </span>
        )}
        <span className="tag tag-neutral thumb-tag">{clock(clip.durationSeconds)}</span>
        <span className="tag tag-neutral clip-preview-index mono">{index + 1}</span>
      </div>

      <div className="stack" style={{ gap: 2 }}>
        <span className="card-title clamp-2">{clip.title}</span>
        <span className="card-meta clamp-2">{line || t('preview.noLine')}</span>
        <span className="card-meta mono">
          {clip.timestamp} · {clock(clip.durationSeconds)}
        </span>
      </div>

      <div className="row gap-1 wrap">
        {clip.featured && <span className="tag tag-warn">{t('preview.featured')}</span>}
        {clip.videoPending && <span className="tag tag-neutral">{t('preview.pictureCutting')}</span>}
        {!clip.hasVideo && !clip.videoPending && (
          <span className="tag tag-neutral">{t('preview.soundOnly')}</span>
        )}
        {clip.audioPending && <span className="tag tag-neutral">{t('preview.soundCutting')}</span>}
      </div>

      {media && media !== 'none' && media.kind === 'video' && (
        <video className="clip-preview-media" src={media.url} controls autoPlay playsInline />
      )}
      {media && media !== 'none' && media.kind === 'audio' && (
        <audio className="clip-preview-media" src={media.url} controls autoPlay />
      )}
      {media === 'none' && <div className="card-meta">{t('preview.noSound')}</div>}

      <div className="row gap-2 wrap" style={{ marginTop: 'auto' }}>
        {media === null && (
          <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void play()}>
            <Icon name="play" size={14} />
            {t('preview.play')}
          </button>
        )}
        {/* In a new tab: the app is another build at this origin, and the
            console should still be here when the admin comes back. */}
        <a className="btn btn-secondary" href={`/library/${clip.id}/practice`} target="_blank" rel="noreferrer">
          {t('preview.openInApp')}
        </a>
      </div>
    </div>
  )
}
