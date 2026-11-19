import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useT, type Translate } from '../i18n'
import { Icon } from '../components/Icon'
import { Loading } from '../components/LoadState'
import type { Episode } from '../data/types'
import { useNewEpisodes } from '../lib/newEpisodes'
import { explain } from '../lib/errors'
import { useRemote } from '../lib/remote'
import { clock } from '../lib/time'
import { repository } from '../repository'

/**
 * One series and its episodes.
 *
 * A series is a shelf, not a sequence: which episode to practise is a choice,
 * where in an episode you left off is a position. So this is a list of
 * episodes and the screen below it is a list of clips in the order they were
 * spoken.
 */
export function SeriesScreen() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const t = useT()
  const remote = useRemote(slug ?? '', (s) => repository.playlist(s))

  return (
    <div className="stack gap-4">
      <button
        type="button"
        className="btn btn-ghost"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => navigate('/library')}
      >
        <Icon name="chevron-left" />
        {t('series.back')}
      </button>

      {remote.state === 'loading' && <Loading />}
      {remote.state === 'error' && (
        <div className="card-meta">
          {remote.status === 404 ? t('series.notFound') : remote.message}
        </div>
      )}
      {remote.state === 'ready' && <Body page={remote.value} t={t} />}
    </div>
  )
}

function Body({ page, t }: { page: Awaited<ReturnType<typeof repository.playlist>>; t: Translate }) {
  const { playlist, episodes } = page
  const fresh = useNewEpisodes()
  const isNew = new Set(fresh.episodes.map((e) => e.id))
  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <div className="row gap-2" style={{ alignItems: 'center' }}>
          <h1 style={{ margin: 0 }}>{playlist.title}</h1>
          {playlist.hot && (
            <span className="tag tag-accent" title={t('library.hotTitle')}>
              <Icon name="flame" size={12} />
              {t('library.hot')}
            </span>
          )}
        </div>
        {playlist.description !== '' && <p className="card-meta" style={{ margin: 0 }}>{playlist.description}</p>}
        <div className="card-meta">
          {t('library.seriesCounts', playlist.episodes, playlist.clips)}
          {playlist.recentTakes > 0 && ` · ${t('library.takesThisWeek', playlist.recentTakes)}`}
        </div>
        <FollowButton slug={playlist.slug} initial={page.following} t={t} />
      </div>

      {episodes.length === 0 ? (
        <div className="card-meta">{t('series.noEpisodes')}</div>
      ) : (
        <div className="stack gap-2">
          {episodes.map((episode) => (
            <EpisodeRow key={episode.id} episode={episode} isNew={isNew.has(episode.id)} t={t} />
          ))}
        </div>
      )}
    </>
  )
}

/**
 * Following a series: practising in one follows it, and this is where a learner
 * says so themselves, or stops. A followed series' new episodes come first in
 * what is new, and are what reminders will be about.
 */
function FollowButton({ slug, initial, t }: { slug: string; initial: boolean; t: Translate }) {
  const [following, setFollowing] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toggle = async () => {
    setBusy(true)
    setError(null)
    try {
      if (following) await repository.unfollow(slug)
      else await repository.follow(slug)
      setFollowing(!following)
    } catch (err) {
      setError(explain(err, t, t('follow.failed')))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="row gap-2 wrap" style={{ alignItems: 'center' }}>
      <button
        type="button"
        className={`btn ${following ? 'btn-secondary' : 'btn-primary'}`}
        aria-pressed={following}
        disabled={busy}
        onClick={() => void toggle()}
      >
        {following ? t('follow.following') : t('follow.follow')}
      </button>
      <span className="card-meta">{error ?? t('follow.hint')}</span>
    </div>
  )
}

function EpisodeRow({ episode, isNew, t }: { episode: Episode; isNew: boolean; t: Translate }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="link-button card elev-sm playlist-row episode-row"
      aria-label={t('series.openEpisode', episode.title)}
      onClick={() => navigate(`/library/e/${episode.id}`)}
    >
      <span className="playlist-thumb">
        {episode.posterUrl ? (
          <img src={episode.posterUrl} alt="" loading="lazy" />
        ) : (
          <Icon name="play" size={16} />
        )}
      </span>
      <span className="stack" style={{ gap: 2, minWidth: 0 }}>
        <span className="card-title clamp-2" style={{ fontSize: 14 }}>
          {isNew && <span className="tag tag-accent new-tag">{t('newEps.tag')}</span>}
          {episode.title}
        </span>
        <span className="card-meta mono">
          {t('series.episodeCounts', episode.clips, clock(episode.seconds))}
        </span>
      </span>
      <Icon name="chevron-right" />
    </button>
  )
}
