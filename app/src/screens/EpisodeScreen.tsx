import { useNavigate, useParams } from 'react-router-dom'
import { useT, type Translate } from '../i18n'
import { Icon } from '../components/Icon'
import { Loading } from '../components/LoadState'
import { episodeProgress } from '../lib/clips'
import { useRemote } from '../lib/remote'
import { colorFor } from '../lib/score'
import { clock } from '../lib/time'
import { repository, type EpisodePage } from '../repository'
import { useApp } from '../store/context'

/**
 * One episode's clips, in the order they were spoken.
 *
 * A grid is right for browsing and wrong for an episode: two hundred cards from
 * one recording say nothing about the order the lines came in or where you left
 * off. An episode is a sequence, so this is a list — numbered, in source order,
 * with the line on every row and the next unpractised clip one button away.
 */
export function EpisodeScreen() {
  const { episodeId } = useParams()
  const navigate = useNavigate()
  const t = useT()
  const remote = useRemote(episodeId ?? '', (id) => repository.episode(id))

  const back = remote.state === 'ready' && remote.value.playlist
  return (
    <div className="stack gap-4">
      <button
        type="button"
        className="btn btn-ghost"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => navigate(back ? `/library/s/${encodeURIComponent(back.slug)}` : '/library')}
      >
        <Icon name="chevron-left" />
        {back ? back.title : t('series.back')}
      </button>

      {remote.state === 'loading' && <Loading />}
      {remote.state === 'error' && (
        <div className="card-meta">
          {remote.status === 404 ? t('episode.notFound') : remote.message}
        </div>
      )}
      {remote.state === 'ready' && <Body page={remote.value} t={t} />}
    </div>
  )
}

function Body({ page, t }: { page: EpisodePage; t: Translate }) {
  const navigate = useNavigate()
  const { statsFor } = useApp()
  const { episode, clips } = page
  const progress = episodeProgress(clips, (id) => statsFor(id).attempts > 0)

  if (clips.length === 0) {
    return (
      <>
        <h1 style={{ margin: 0 }}>{episode.title}</h1>
        <div className="card-meta">{t('episode.noClips')}</div>
      </>
    )
  }

  const percent = Math.round((progress.practised / progress.total) * 100)

  return (
    <>
      <div className="stack" style={{ gap: 4 }}>
        <h1 style={{ margin: 0 }}>{episode.title}</h1>
        <div className="card-meta">
          {t('playlist.clipsAndPractised', progress.total, progress.practised)}
        </div>
      </div>

      <div className="stack gap-2">
        <div className="progress-track" role="img" aria-label={t('playlist.percentPractised', percent)}>
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        {progress.next ? (
          <button
            type="button"
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => navigate(`/library/${progress.next!.id}/practice`)}
          >
            <Icon name="mic" size={14} />
            {t('playlist.practiceNext', progress.next.title)}
          </button>
        ) : (
          // Not a dead end: going round again is the point of shadowing, and
          // the list below is still there to pick from.
          <div className="card-meta">{t('playlist.allPractised')}</div>
        )}
      </div>

      <div className="stack gap-2">
        {clips.map((clip, index) => {
          const stats = statsFor(clip.id)
          const line = clip.captions[0]?.text ?? ''
          return (
            <div className="card elev-sm playlist-row" key={clip.id} data-practised={stats.attempts > 0}>
              <span className="card-meta mono playlist-index">{index + 1}</span>

              <button
                type="button"
                className="link-button playlist-thumb"
                onClick={() => navigate(`/library/${clip.id}`)}
                aria-label={t('library.openAnalysis', clip.title)}
              >
                {clip.posterUrl ? (
                  <img src={clip.posterUrl} alt="" loading="lazy" />
                ) : (
                  <Icon name="play" size={16} />
                )}
              </button>

              <button
                type="button"
                className="link-button stack playlist-body"
                style={{ gap: 2 }}
                onClick={() => navigate(`/library/${clip.id}`)}
                aria-label={clip.title}
              >
                <span className="card-title clamp-2" style={{ fontSize: 14 }}>
                  {line || clip.title}
                </span>
                <span className="card-meta mono">
                  {clip.timestamp} · {clock(clip.durationSeconds)}
                  {stats.attempts > 0 && ` · ${t('library.takes', stats.attempts)}`}
                </span>
              </button>

              <span
                className="score-big playlist-score"
                style={{ color: stats.lastScore === null ? 'var(--color-neutral-500)' : colorFor(stats.lastScore) }}
              >
                {stats.lastScore ?? '—'}
              </span>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate(`/library/${clip.id}/practice`)}
              >
                <Icon name="mic" size={14} />
                {t('library.practice')}
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}
