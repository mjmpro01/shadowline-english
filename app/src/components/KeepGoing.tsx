import { useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { useNewEpisodes } from '../lib/newEpisodes'
import { clock } from '../lib/time'
import type { Continue } from '../repository'
import { Icon } from './Icon'

/**
 * Where the learner left off: the episode they were in, how far through it,
 * and the next line, one press away. Opening the app to carry on used to mean
 * finding the series, then the episode, then counting down the list.
 */
export function ContinueCard({ cont }: { cont: Continue }) {
  const t = useT()
  const navigate = useNavigate()
  const share = cont.total > 0 ? cont.practised / cont.total : 0
  return (
    <section className="card elev-sm continue-card" aria-labelledby="continue-title">
      <span className="continue-thumb" aria-hidden="true">
        {cont.next.posterUrl || cont.episode.posterUrl ? (
          <img src={cont.next.posterUrl || cont.episode.posterUrl} alt="" loading="lazy" />
        ) : (
          <Icon name="play" size={20} />
        )}
      </span>
      <div className="stack gap-1" style={{ minWidth: 0, flex: 1 }}>
        <span className="card-kicker" style={{ margin: 0 }}>
          {t('continue.kicker')}
        </span>
        <h2 id="continue-title" className="continue-title clamp-2">
          {cont.playlist ? `${cont.playlist.title} · ` : ''}
          {cont.episode.title}
        </h2>
        <div
          className="continue-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={cont.total}
          aria-valuenow={cont.practised}
          aria-label={t('continue.progress', cont.practised, cont.total)}
        >
          <span style={{ width: `${share * 100}%` }} />
        </div>
        <span className="card-meta">{t('continue.progress', cont.practised, cont.total)}</span>
        <div className="row gap-2 wrap" style={{ marginTop: 'var(--space-1)' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate(`/library/${cont.next.id}/practice`)}
          >
            <Icon name="mic" size={16} />
            {t('continue.go')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(`/library/e/${cont.episode.id}`)}>
            {t('continue.episode')}
          </button>
        </div>
      </div>
    </section>
  )
}

/**
 * What is new to the learner: the newest episodes, followed series first, until
 * each is opened. Auto-imported episodes arrive by themselves, and nothing said
 * so; this does.
 */
export function NewEpisodesRow() {
  const t = useT()
  const navigate = useNavigate()
  const { episodes } = useNewEpisodes()
  if (episodes.length === 0) return null
  const sinceVisit = episodes.some((e) => e.sinceLastVisit)
  return (
    <section aria-labelledby="new-title">
      <h2 id="new-title" className="card-kicker" style={{ marginBottom: 'var(--space-2)' }}>
        {sinceVisit ? t('newEps.sinceVisit') : t('newEps.title')}
      </h2>
      <div className="shelf-row">
        {episodes.slice(0, 12).map((episode) => (
          <button
            type="button"
            key={episode.id}
            className="link-button card elev-sm new-episode"
            aria-label={t('series.openEpisode', episode.standalone ? episode.playlistTitle : episode.title)}
            onClick={() => navigate(`/library/e/${episode.id}`)}
          >
            <span className="new-episode-cover">
              {episode.posterUrl ? <img src={episode.posterUrl} alt="" loading="lazy" /> : <Icon name="play" size={20} />}
              <span className="tag tag-accent new-tag new-episode-tag">{t('newEps.tag')}</span>
            </span>
            <span className="stack" style={{ gap: 2, padding: 'var(--space-2) var(--space-3) var(--space-3)' }}>
              <span className="card-title clamp-2" style={{ fontSize: 14 }}>
                {episode.standalone ? episode.playlistTitle : episode.title}
              </span>
              <span className="card-meta clamp-2">
                {episode.standalone ? t('newEps.newClips') : episode.playlistTitle}
                {episode.followed && ` · ${t('newEps.followed')}`}
              </span>
              <span className="card-meta mono">{t('series.episodeCounts', episode.clips, clock(episode.seconds))}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
