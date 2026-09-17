import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { LoadFailure, Loading } from '../components/LoadState'
import { playlistClips, playlistProgress } from '../lib/clips'
import { colorFor } from '../lib/score'
import { clock } from '../lib/time'
import { useApp } from '../store/context'

/**
 * One recording's clips, in the order they were spoken.
 *
 * The library is a grid, which is right for browsing and wrong for an episode:
 * two hundred cards from one film say nothing about where you are in it or
 * where you left off. A playlist is a sequence, so this is a list — numbered,
 * in source order, with the line on every row and the next unpractised clip one
 * button away.
 */
export function PlaylistScreen() {
  const { name } = useParams()
  const navigate = useNavigate()
  const { data, state, statsFor } = useApp()

  const playlist = decodeURIComponent(name ?? '')
  const clips = playlistClips(data.videos, playlist)
  const progress = playlistProgress(clips, (id) => statsFor(id).attempts > 0)

  if (state === 'loading') return <Loading />
  if (state === 'error') return <LoadFailure />

  if (clips.length === 0) {
    return (
      <div className="stack gap-3">
        <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/library')}>
          <Icon name="chevron-left" />
          Library
        </button>
        <h1 style={{ margin: 0 }}>{playlist}</h1>
        <div className="card-meta">No clips in this playlist — it may have been renamed or emptied.</div>
      </div>
    )
  }

  const percent = Math.round((progress.practised / progress.total) * 100)

  return (
    <div className="stack gap-4">
      <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/library')}>
        <Icon name="chevron-left" />
        Library
      </button>

      <div className="stack" style={{ gap: 4 }}>
        <h1 style={{ margin: 0 }}>{playlist}</h1>
        <div className="card-meta">
          {progress.total} clips · {progress.practised} practised
        </div>
      </div>

      <div className="stack gap-2">
        <div className="progress-track" role="img" aria-label={`${percent}% practised`}>
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
            Practice next — {progress.next.title}
          </button>
        ) : (
          // Not a dead end: going round again is the point of shadowing, and
          // the list below is still there to pick from.
          <div className="card-meta">Every clip here has been practised at least once.</div>
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
                aria-label={`Open analysis for ${clip.title}`}
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
                  {stats.attempts > 0 && ` · ${stats.attempts} takes`}
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
                Practice
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
