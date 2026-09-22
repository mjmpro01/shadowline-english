import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT, type Translate } from '../i18n'
import { ClipCard } from '../components/ClipCard'
import { Icon } from '../components/Icon'
import { Loading } from '../components/LoadState'
import type { Episode, Playlist, SearchResults } from '../data/types'
import { searchIsWorthRunning } from '../lib/library'
import { useDebounced, useRemote } from '../lib/remote'
import { tintOf } from '../lib/score'
import { clock } from '../lib/time'
import { repository } from '../repository'
import { useApp } from '../store/context'
import { allCategories } from '../lib/clips'

/**
 * The library's front door: every series, and one search across all of them.
 *
 * It used to be every clip in one grid, filtered in the browser. That is the
 * right shape for forty clips and the wrong one for a series — two hundred
 * cards off one season say nothing about which episode they came from — and it
 * needed the whole library in memory before it could draw the first card.
 */
export function LibraryScreen() {
  const t = useT()
  const [query, setQuery] = useState('')
  // A beat behind the typing: the request goes out when somebody stops, not on
  // every keystroke.
  const settled = useDebounced(query.trim(), 250)
  const searching = searchIsWorthRunning(settled)

  // The tags are read from the clips the app already holds, and each one is a
  // search rather than a filter of its own: a category cuts across series, so
  // it has no place in a tree, and the server matches tags already. This is the
  // one thing on this screen still reading the whole library, and it comes out
  // with that load when the load goes.
  const { data } = useApp()
  const categories = allCategories(data.videos)

  const series = useRemote('', () => repository.listPlaylists())
  const found = useRemote(searching ? settled : '', (q) =>
    searchIsWorthRunning(q) ? repository.searchLibrary(q) : Promise.resolve(NOTHING),
  )

  return (
    <div className="stack gap-6">
      <h1>{t('library.title')}</h1>

      <input
        type="search"
        className="input"
        placeholder={t('library.searchTree')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t('library.searchLabel')}
      />

      {categories.length > 0 && query.trim() === '' && (
        <div className="row gap-2 wrap">
          {categories.map((name) => (
            <button
              type="button"
              key={name}
              className="tag tag-neutral"
              style={{ cursor: 'pointer', border: 'none' }}
              onClick={() => setQuery(name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Typing takes over the screen. Showing the series grid underneath a set
          of results would leave two answers to one question on one page. */}
      {query.trim() !== '' ? (
        <Found query={query.trim()} settled={settled} remote={found} t={t} />
      ) : (
        <Series remote={series} t={t} />
      )}
    </div>
  )
}

const NOTHING: SearchResults = { playlists: [], episodes: [], clips: [] }

function Series({ remote, t }: { remote: ReturnType<typeof useRemote<Playlist[]>>; t: Translate }) {
  if (remote.state === 'loading') return <Loading />
  if (remote.state === 'error') return <div className="card-meta">{remote.message}</div>
  if (remote.value.length === 0) return <div className="card-meta">{t('library.noSeries')}</div>

  return (
    <div className="grid-series">
      {remote.value.map((playlist) => (
        <SeriesCard key={playlist.id} playlist={playlist} t={t} />
      ))}
    </div>
  )
}

function SeriesCard({ playlist, t }: { playlist: Playlist; t: Translate }) {
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

function Found({
  query,
  settled,
  remote,
  t,
}: {
  query: string
  settled: string
  remote: ReturnType<typeof useRemote<SearchResults>>
  t: Translate
}) {
  if (!searchIsWorthRunning(query)) {
    return <div className="card-meta">{t('library.searchTooShort')}</div>
  }
  // The answer on screen is for the query that has settled, not the one being
  // typed. Saying "nothing matches" for a word somebody is halfway through is
  // wrong for a moment and reads as wrong for longer.
  if (remote.state === 'loading' || settled !== query) {
    return <Loading label={t('library.searching')} />
  }
  if (remote.state === 'error') return <div className="card-meta">{remote.message}</div>

  const { playlists, episodes, clips } = remote.value
  if (playlists.length + episodes.length + clips.length === 0) {
    return <div className="card-meta">{t('library.searchNothing', query)}</div>
  }

  return (
    <div className="stack gap-6">
      {playlists.length > 0 && (
        <section className="stack gap-3">
          <h2 className="section-title">{t('library.foundSeries')}</h2>
          <div className="grid-series">
            {playlists.map((playlist) => (
              <SeriesCard key={playlist.id} playlist={playlist} t={t} />
            ))}
          </div>
        </section>
      )}

      {episodes.length > 0 && (
        <section className="stack gap-3">
          <h2 className="section-title">{t('library.foundEpisodes')}</h2>
          <div className="stack gap-2">
            {episodes.map((episode) => (
              <EpisodeHit key={episode.id} episode={episode} t={t} />
            ))}
          </div>
        </section>
      )}

      {clips.length > 0 && (
        <section className="stack gap-3">
          <h2 className="section-title">{t('library.foundClips')}</h2>
          <div className="grid-cards">
            {clips.map((clip) => (
              <ClipCard key={clip.id} clip={clip} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function EpisodeHit({ episode, t }: { episode: Episode; t: Translate }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="link-button card elev-sm playlist-row episode-row"
      aria-label={t('series.openEpisode', episode.title)}
      onClick={() => navigate(`/library/e/${episode.id}`)}
    >
      <span className="playlist-thumb">
        {episode.posterUrl ? <img src={episode.posterUrl} alt="" loading="lazy" /> : <Icon name="play" size={16} />}
      </span>
      <span className="stack" style={{ gap: 2, minWidth: 0 }}>
        <span className="card-title clamp-2" style={{ fontSize: 14 }}>
          {episode.title}
        </span>
        <span className="card-meta mono">{t('series.episodeCounts', episode.clips, clock(episode.seconds))}</span>
      </span>
      <Icon name="chevron-right" />
    </button>
  )
}
