import { useCallback, useEffect, useState } from 'react'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Loading } from '../components/LoadState'
import { SavedField } from '../components/SavedField'
import type { Episode, Playlist } from '../data/types'
import { ApiError } from '../lib/api'
import { clock } from '../lib/time'
import { repository } from '../repository'

/**
 * The studio's third tab: the shelf rather than what is on it.
 *
 * A series and its episodes are rows now, so they are things an admin can name,
 * describe, order and push. Without this the only way to mark a series hot
 * would be a PATCH by hand, which is not a feature — it is an endpoint.
 */
export function StudioSeries({ onCount }: { onCount: (n: number) => void }) {
  const t = useT()
  const [series, setSeries] = useState<Playlist[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const listed = await repository.listPlaylists()
      setSeries(listed)
      onCount(listed.length)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the series.')
    }
  }, [onCount])

  useEffect(() => {
    // Every setState inside reload() runs after an await, so none of them
    // happens during this effect — the rule cannot see through the async
    // boundary.
    // eslint-disable-next-line react/set-state-in-effect
    void reload()
  }, [reload])

  if (error !== null) return <div className="card-meta">{error}</div>
  if (series === null) return <Loading />
  if (series.length === 0) return <div className="card-meta">{t('library.noSeries')}</div>

  return (
    <div className="stack gap-3">
      {series.map((playlist) => (
        <div className="card elev-sm stack gap-2" key={playlist.id}>
          <div className="row between wrap gap-2">
            <span className="card-meta mono">
              {t('library.seriesCounts', playlist.episodes, playlist.clips)}
              {` · /${playlist.slug}`}
              {playlist.recentTakes > 0 && ` · ${t('library.takesThisWeek', playlist.recentTakes)}`}
            </span>
            <div className="row gap-2">
              {/* The badge is a decision, so it is a button rather than a
                  number somebody has to interpret. What it is worth is the
                  take count beside it, which nobody can set. */}
              <button
                type="button"
                className={`btn ${playlist.hot ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  void repository.updatePlaylist(playlist.id, { hot: !playlist.hot }).then(reload)
                }}
              >
                <Icon name="flame" size={12} />
                {playlist.hot ? t('studio.hotOn') : t('studio.hotOff')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOpen(open === playlist.id ? null : playlist.id)}
              >
                {t('studio.episodes', playlist.episodes)}
                <Icon name={open === playlist.id ? 'chevron-left' : 'chevron-right'} />
              </button>
            </div>
          </div>

          <div className="row gap-3 wrap">
            <SavedField
              id={`series-name-${playlist.id}`}
              label={t('studio.seriesName')}
              value={playlist.title}
              style={{ flex: '1 1 220px' }}
              onSave={(title) => void repository.updatePlaylist(playlist.id, { title }).then(reload)}
            />
            <SavedField
              id={`series-order-${playlist.id}`}
              label={t('studio.order')}
              value={String(playlist.position)}
              style={{ flex: '0 0 90px' }}
              onSave={(raw) => {
                const position = Number.parseInt(raw, 10)
                if (Number.isNaN(position)) return
                void repository.updatePlaylist(playlist.id, { position }).then(reload)
              }}
            />
          </div>
          <SavedField
            id={`series-about-${playlist.id}`}
            label={t('studio.seriesAbout')}
            value={playlist.description}
            onSave={(description) =>
              void repository.updatePlaylist(playlist.id, { description }).then(reload)
            }
          />

          {open === playlist.id && <Episodes playlist={playlist} series={series} onChange={reload} />}
        </div>
      ))}
    </div>
  )
}

function Episodes({
  playlist,
  series,
  onChange,
}: {
  playlist: Playlist
  series: Playlist[]
  onChange: () => Promise<void>
}) {
  const t = useT()
  const [episodes, setEpisodes] = useState<Episode[] | null>(null)

  const reload = useCallback(async () => {
    const page = await repository.playlist(playlist.slug)
    setEpisodes(page.episodes)
  }, [playlist.slug])

  useEffect(() => {
    // Every setState inside reload() runs after an await, so none of them
    // happens during this effect — the rule cannot see through the async
    // boundary.
    // eslint-disable-next-line react/set-state-in-effect
    void reload()
  }, [reload])

  const after = async () => {
    await reload()
    await onChange()
  }

  if (episodes === null) return <Loading />
  if (episodes.length === 0) return <div className="card-meta">{t('series.noEpisodes')}</div>

  return (
    <div className="stack gap-2" style={{ marginTop: 'var(--space-2)' }}>
      {episodes.map((episode) => (
        <div className="card stack gap-2" key={episode.id}>
          <span className="card-meta mono">
            {t('series.episodeCounts', episode.clips, clock(episode.seconds))}
          </span>
          <div className="row gap-3 wrap" style={{ alignItems: 'flex-end' }}>
            <SavedField
              id={`ep-name-${episode.id}`}
              label={t('studio.episodeName')}
              value={episode.title}
              style={{ flex: '1 1 220px' }}
              onSave={(title) => void repository.updateEpisode(episode.id, { title }).then(after)}
            />
            <SavedField
              id={`ep-order-${episode.id}`}
              label={t('studio.order')}
              value={String(episode.position)}
              style={{ flex: '0 0 90px' }}
              onSave={(raw) => {
                const position = Number.parseInt(raw, 10)
                if (Number.isNaN(position)) return
                void repository.updateEpisode(episode.id, { position }).then(after)
              }}
            />
            <label className="stack" style={{ gap: 4, flex: '1 1 180px' }}>
              <span className="card-meta">{t('studio.inSeries')}</span>
              <select
                className="input"
                value={episode.playlistId ?? ''}
                onChange={(e) => {
                  void repository.updateEpisode(episode.id, { playlistId: e.target.value }).then(after)
                }}
              >
                {series.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ))}
    </div>
  )
}
