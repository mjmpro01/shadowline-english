import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Banners } from '../components/Banners'
import { useT, type Translate } from '../i18n'
import { ClipCard } from '../components/ClipCard'
import { Pager } from '../components/Pager'
import { SeriesCard } from '../components/SeriesCard'
import { Icon } from '../components/Icon'
import { Loading } from '../components/LoadState'
import type { Episode, PlaylistList, SearchResults, SectionRow } from '../data/types'
import { searchIsWorthRunning } from '../lib/library'
import { useDebounced, useRemote } from '../lib/remote'
import { iconFor } from '../lib/topics'
import { clock } from '../lib/time'
import { repository } from '../repository'

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

  // Each tag is a search rather than a filter of its own: a category cuts
  // across series, so it has no place in a tree, and the server matches tags
  // already. The list comes from the library's summary — this used to read
  // every clip in the library, which is why the app was being sent them.
  const summary = useRemote('', () => repository.librarySummary())
  const categories = summary.state === 'ready' ? summary.value.categories : []

  // The page is in the address, so the back button and a shared link land on
  // the same page of the library rather than the first.
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const series = useRemote(String(page), (key) =>
    repository.playlistPage((Number(key) - 1) * SERIES_PER_PAGE, SERIES_PER_PAGE),
  )
  const goTo = (next: number) => {
    setParams(next > 1 ? { page: String(next) } : {})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  // The shelves an admin filled. Asked for once: they head the first page and
  // are not part of the paging below them.
  const shelves = useRemote('', () => repository.sections())
  const hasShelves = shelves.state === 'ready' && shelves.value.length > 0
  const found = useRemote(searching ? settled : '', (q) =>
    searchIsWorthRunning(q) ? repository.searchLibrary(q) : Promise.resolve(NOTHING),
  )

  return (
    <div className="stack gap-6">
      <h1>{t('library.title')}</h1>

      <Banners placement="library" />

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
            <button type="button" key={name} className="topic-chip" onClick={() => setQuery(name)}>
              <span aria-hidden="true">{iconFor([name])}</span>
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
        <>
          {/* On the first page only: the shelves are the way into the library,
              and a learner on page 3 of every series has already chosen the
              other way. */}
          {page === 1 && shelves.state === 'ready' &&
            shelves.value.map((shelf) => <Shelf key={shelf.id} shelf={shelf} t={t} />)}
          <section className="stack gap-3">
            {hasShelves && <h2 className="section-title">{t('library.allSeries')}</h2>}
            <Series remote={series} page={page} onPage={goTo} t={t} />
          </section>
        </>
      )}
    </div>
  )
}

const NOTHING: SearchResults = { playlists: [], episodes: [], clips: [] }

/**
 * One shelf: its name, and a row of its series that scrolls sideways — the
 * shape every streaming app has taught people to read as "a kind of thing".
 * The whole shelf is a page of its own, behind "See all".
 */
function Shelf({ shelf, t }: { shelf: SectionRow; t: Translate }) {
  return (
    <section className="stack gap-2 shelf" aria-labelledby={`shelf-${shelf.id}`}>
      <div className="row between gap-2" style={{ alignItems: 'baseline' }}>
        <h2 className="section-title shelf-title" id={`shelf-${shelf.id}`}>
          {shelf.icon && <span aria-hidden="true">{shelf.icon}</span>}
          {shelf.title}
        </h2>
        <Link className="shelf-all" to={`/library/shelf/${encodeURIComponent(shelf.slug)}`}>
          {t('library.seeAll', shelf.series)}
          <Icon name="chevron-right" size={16} />
        </Link>
      </div>
      {shelf.description && <div className="card-meta">{shelf.description}</div>}
      <div className="shelf-row">
        {shelf.items.map((playlist) => (
          <SeriesCard key={playlist.id} playlist={playlist} t={t} />
        ))}
      </div>
    </section>
  )
}

/** Three rows of four on a wide screen, four of three on a narrower one. */
const SERIES_PER_PAGE = 12

function Series({
  remote,
  page,
  onPage,
  t,
}: {
  remote: ReturnType<typeof useRemote<PlaylistList>>
  page: number
  onPage: (page: number) => void
  t: Translate
}) {
  if (remote.state === 'loading') return <Loading />
  if (remote.state === 'error') return <div className="card-meta">{remote.message}</div>
  const { items, total, limit } = remote.value
  const pages = Math.max(1, Math.ceil(total / limit))
  // A page past the end — an old link, a series deleted since — goes to the
  // last one there is rather than to an empty grid.
  if (items.length === 0 && total > 0) {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => onPage(pages)}>
        {t('library.pageGo', pages)}
      </button>
    )
  }
  if (total === 0) return <div className="card-meta">{t('library.noSeries')}</div>

  return (
    <div className="stack gap-4">
      <div className="grid-series">
        {items.map((playlist) => (
          <SeriesCard key={playlist.id} playlist={playlist} t={t} />
        ))}
      </div>
      {pages > 1 && <Pager page={page} pages={pages} onPage={onPage} t={t} />}
    </div>
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
