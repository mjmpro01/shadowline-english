import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n, type Translate } from '../i18n'
import { Icon } from '../components/Icon'
import { ListenAgain, heardPercent } from '../components/ListenAgain'
import { Loading } from '../components/LoadState'
import { Pager } from '../components/Pager'
import type { Playlist, SearchResults } from '../data/types'
import { searchIsWorthRunning } from '../lib/library'
import { useDebounced, useRemote } from '../lib/remote'
import { clock } from '../lib/time'
import { repository } from '../repository'

const SERIES_PER_PAGE = 12
const NOTHING: SearchResults = { playlists: [], episodes: [], clips: [] }

/**
 * The dictation tab: what is due to be heard again today, a passage to start
 * on — found by search, or by series and episode — and what has been written
 * down lately.
 */
export function DictationHomeScreen() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const settled = useDebounced(query.trim(), 250)
  const searching = searchIsWorthRunning(settled)
  const found = useRemote(searching ? settled : '', (q) =>
    searchIsWorthRunning(q) ? repository.searchLibrary(q) : Promise.resolve(NOTHING),
  )
  const [page, setPage] = useState(1)
  const series = useRemote(String(page), (key) =>
    repository.playlistPage((Number(key) - 1) * SERIES_PER_PAGE, SERIES_PER_PAGE),
  )
  const history = useRemote('', () => repository.dictations())
  const recent = history.state === 'ready' ? history.value.recent : []

  return (
    <div className="stack gap-6">
      <div className="stack" style={{ gap: 4 }}>
        <h1 style={{ margin: 0 }}>{t('nav.dictation')}</h1>
        <div className="card-meta">{t('dictation.homeIntro')}</div>
      </div>

      <ListenAgain whenNone={t('dictation.noneDue')} />

      <section className="stack gap-3" aria-labelledby="dict-pick">
        <h2 id="dict-pick" className="card-kicker" style={{ margin: 0 }}>
          {t('dictation.pick')}
        </h2>
        <input
          type="search"
          className="input"
          placeholder={t('dictation.search')}
          aria-label={t('dictation.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim() !== '' ? (
          !searchIsWorthRunning(query.trim()) ? (
            <div className="card-meta">{t('library.searchTooShort')}</div>
          ) : found.state === 'error' ? (
            <div className="card-meta">{found.message}</div>
          ) : found.state === 'loading' || settled !== query.trim() ? (
            <Loading label={t('library.searching')} />
          ) : (
            <Found results={found.value} query={query.trim()} t={t} />
          )
        ) : series.state === 'loading' ? (
          <Loading />
        ) : series.state === 'error' ? (
          <div className="card-meta">{series.message}</div>
        ) : series.value.items.length === 0 ? (
          <div className="card-meta">{t('dictation.noSeries')}</div>
        ) : (
          <>
            <div className="stack gap-2">
              {series.value.items.map((p) => (
                <Series key={p.id} playlist={p} t={t} />
              ))}
            </div>
            {series.value.total > SERIES_PER_PAGE && (
              <Pager
                page={page}
                pages={Math.ceil(series.value.total / SERIES_PER_PAGE)}
                onPage={setPage}
                t={t}
              />
            )}
          </>
        )}
      </section>

      <section className="stack gap-2" aria-labelledby="dict-recent" data-testid="dict-recent">
        <h2 id="dict-recent" className="card-kicker" style={{ margin: 0 }}>
          {t('dictation.recent')}
        </h2>
        {history.state === 'ready' && recent.length === 0 && (
          <div className="card-meta">{t('dictation.noRecent')}</div>
        )}
        {recent.map((d) => (
          <div key={d.id} className="dict-line">
            <span className="stack" style={{ gap: 2, minWidth: 0 }}>
              <span className="card-title clamp-2" style={{ fontSize: 15 }}>
                {d.firstLine || d.episodeTitle}
              </span>
              <span className="card-meta">
                {d.episodeTitle} · {t('dictation.accuracy', heardPercent(d))} ·{' '}
                {new Date(d.createdAt).toLocaleDateString(locale)}
              </span>
            </span>
            {d.firstClipId && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate(`/dictation/e/${d.episodeId}/${d.firstClipId}`)}
              >
                <Icon name="square-pen" size={14} />
                {t('dictation.again')}
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}

/** A series, opening in place onto its episodes. */
function Series({ playlist, t }: { playlist: Playlist; t: Translate }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card elev-sm stack gap-2 dict-series">
      <button
        type="button"
        className="link-button row between gap-2"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="stack" style={{ gap: 2, minWidth: 0, textAlign: 'left' }}>
          <span className="card-title">{playlist.title}</span>
          <span className="card-meta">{t('library.seriesCounts', playlist.episodes, playlist.clips)}</span>
        </span>
        <Icon name={open ? 'chevron-left' : 'chevron-right'} size={18} />
      </button>
      {open && <Episodes slug={playlist.slug} t={t} />}
    </div>
  )
}

function Episodes({ slug, t }: { slug: string; t: Translate }) {
  const navigate = useNavigate()
  const remote = useRemote(slug, (s) => repository.playlist(s))
  if (remote.state === 'loading') return <Loading />
  if (remote.state === 'error') return <div className="card-meta">{remote.message}</div>
  if (remote.value.episodes.length === 0) return <div className="card-meta">{t('series.noEpisodes')}</div>
  return (
    <div className="stack gap-1">
      {remote.value.episodes.map((e) => (
        <button
          key={e.id}
          type="button"
          className="dict-line dict-pick"
          onClick={() => navigate(`/dictation/e/${e.id}`)}
        >
          <span className="dict-line-text">{e.title}</span>
          <span className="card-meta mono">
            {t('dictation.lines', e.clips)} · {clock(e.seconds)}
          </span>
        </button>
      ))}
    </div>
  )
}

function Found({ results, query, t }: { results: SearchResults; query: string; t: Translate }) {
  const navigate = useNavigate()
  const clips = results.clips.filter((c) => c.episodeId)
  if (results.playlists.length + results.episodes.length + clips.length === 0) {
    return <div className="card-meta">{t('library.searchNothing', query)}</div>
  }
  return (
    <div className="stack gap-2" data-testid="dict-found">
      {results.playlists.map((p) => (
        <Series key={p.id} playlist={p} t={t} />
      ))}
      {results.episodes.map((e) => (
        <button
          key={e.id}
          type="button"
          className="dict-line dict-pick"
          onClick={() => navigate(`/dictation/e/${e.id}`)}
        >
          <span className="dict-line-text">{e.title}</span>
          <span className="card-meta mono">{t('dictation.lines', e.clips)}</span>
        </button>
      ))}
      {clips.map((c) => (
        <div key={c.id} className="dict-line">
          <span className="dict-line-text">{c.captions[0]?.text || c.title}</span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate(`/dictation/e/${c.episodeId}/${c.id}`)}
          >
            <Icon name="square-pen" size={14} />
            {t('dictation.fromHere')}
          </button>
        </div>
      ))}
    </div>
  )
}
