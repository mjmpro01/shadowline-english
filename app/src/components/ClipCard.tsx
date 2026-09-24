import { useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { ClipFace } from './ClipFace'
import { Icon } from './Icon'
import type { Video } from '../data/types'
import { colorFor, sparkPoints } from '../lib/score'
import { clock } from '../lib/time'
import { useApp } from '../store/context'

/**
 * One clip as a card: the still, the line, what you last scored on it, and the
 * way in.
 *
 * It was written inline in the library, which was the only place a grid of
 * clips appeared. The library is a tree now and the grid moved to search
 * results, so the card moved with it rather than being written twice.
 */
export function ClipCard({ clip }: { clip: Video }) {
  const navigate = useNavigate()
  const { statsFor } = useApp()
  const t = useT()

  const stats = statsFor(clip.id)
  const color = stats.lastScore === null ? 'var(--color-neutral-500)' : colorFor(stats.lastScore)

  return (
    <div className="card elev-sm" style={{ padding: 'var(--space-2)' }}>
      <button
        type="button"
        className="link-button thumb"
        onClick={() => navigate(`/library/${clip.id}`)}
        aria-label={t('library.openAnalysis', clip.title)}
      >
        {/* The still when the cutter has made one; the icon otherwise, which is
            every clip cut from audio and every one whose cut is still queued. */}
        <ClipFace
          id={clip.id}
          posterUrl={clip.posterUrl}
          line={clip.captions[0]?.text ?? ''}
          categories={clip.categories}
        />
        <span className="tag tag-neutral thumb-tag">{clock(clip.durationSeconds)}</span>
      </button>

      <button
        type="button"
        className="link-button stack"
        style={{ gap: 2 }}
        // Without this the button's name is the whole card read aloud: title,
        // series, score and take count run together.
        aria-label={clip.title}
        onClick={() => navigate(`/library/${clip.id}`)}
      >
        <span className="card-title clamp-2" style={{ fontSize: 15, marginTop: 'var(--space-2)' }}>
          {clip.title}
        </span>
        {/* Never the same thing twice. A clip with no still shows its line on
            the tile above, so this carries the series; one with a still has
            nowhere else to put the line, so it comes back here. Names are
            numbers now — "Clip 3" says nothing — which is why one of the two
            always has to be the line. */}
        <span className="card-meta clamp-2">
          {(clip.posterUrl ? clip.captions[0]?.text : clip.playlist) || clip.playlist || clip.source}
        </span>
        <span className="row between gap-2" style={{ marginTop: 2 }}>
          <span className="score-big" style={{ color }}>
            {stats.lastScore ?? '—'}
          </span>
          <svg width="56" height="20" viewBox="0 0 56 20" aria-hidden="true">
            <polyline points={sparkPoints(stats.sparkline)} fill="none" stroke={color} strokeWidth="2" />
          </svg>
        </span>
        <span className="card-meta">{t('library.takes', stats.attempts)}</span>
      </button>

      <button
        type="button"
        className="btn btn-primary btn-block"
        // Pinned to the bottom of the card rather than to wherever the text
        // above happens to end, so a row of cards has a row of buttons instead
        // of a ragged edge wherever a title wraps.
        style={{ marginTop: 'auto' }}
        onClick={() => navigate(`/library/${clip.id}/practice`)}
      >
        <Icon name="mic" size={14} />
        {t('library.practice')}
      </button>
    </div>
  )
}
