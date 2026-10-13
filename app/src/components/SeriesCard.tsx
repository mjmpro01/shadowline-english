import { useNavigate } from 'react-router-dom'
import type { Translate } from '../i18n'
import type { Playlist } from '../data/types'
import { tintOf } from '../lib/score'
import { Icon } from './Icon'

/** A series as the library shows it: its cover, its name, what is in it. Used
 *  on the front screen's grid, on its shelves, and on a shelf's own page. */
export function SeriesCard({ playlist, t }: { playlist: Playlist; t: Translate }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="link-button card elev-sm series-card"
      aria-label={t('library.openSeries', playlist.title)}
      onClick={() => navigate(`/library/s/${encodeURIComponent(playlist.slug)}`)}
    >
      {/* A still from the first clip that has one. When none does — a series cut
          from audio, or one whose cuts are still queued — the cover carries the
          series' own name on a tint it keeps, the same way a clip with no still
          carries its line. A grid of identical grey rectangles is nothing to
          aim at. */}
      <span
        className="series-cover"
        style={playlist.coverUrl ? undefined : { background: tintOf(playlist.id) }}
      >
        {playlist.coverUrl ? (
          <img src={playlist.coverUrl} alt="" loading="lazy" />
        ) : (
          <span className="series-face">{playlist.title}</span>
        )}
        {/* The badge says an admin picked this one; the line under the title
            says what that is worth this week. A claim and its evidence, rather
            than a claim dressed as one. */}
        {playlist.hot && (
          <span className="tag tag-accent series-hot" title={t('library.hotTitle')}>
            <Icon name="flame" size={12} />
            {t('library.hot')}
          </span>
        )}
      </span>
      <span className="stack" style={{ gap: 2, padding: 'var(--space-3)' }}>
        {/* Never the same thing twice: a series with no cover has its name set
            large across the face above, and printing it again here would be one
            name and two sizes of it. */}
        {playlist.coverUrl !== '' && <span className="card-title clamp-2">{playlist.title}</span>}
        <span className="card-meta">{t('library.seriesCounts', playlist.episodes, playlist.clips)}</span>
        {playlist.recentTakes > 0 && (
          <span className="card-meta">{t('library.takesThisWeek', playlist.recentTakes)}</span>
        )}
      </span>
    </button>
  )
}
