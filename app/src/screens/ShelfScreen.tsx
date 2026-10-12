import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useT, type Translate } from '../i18n'
import { Icon } from '../components/Icon'
import { Loading } from '../components/LoadState'
import { Pager } from '../components/Pager'
import { SeriesCard } from '../components/SeriesCard'
import type { SectionPage } from '../data/types'
import { useRemote } from '../lib/remote'
import { repository } from '../repository'

/** The same twelve a page as the library's list of every series. */
const PER_PAGE = 12

/**
 * One shelf of the library — "For children", "Anime" — whole, a page at a
 * time. The front screen shows the start of it as a row; this is "See all".
 */
export function ShelfScreen() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const t = useT()
  // The page is in the address, as it is on the library's front screen.
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const remote = useRemote(`${slug}\n${page}`, (key) => {
    const [which, n] = key.split('\n')
    return repository.section(which, (Number(n) - 1) * PER_PAGE, PER_PAGE)
  })
  const goTo = (next: number) => {
    setParams(next > 1 ? { page: String(next) } : {})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

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
        <div className="card-meta">{remote.status === 404 ? t('shelf.notFound') : remote.message}</div>
      )}
      {remote.state === 'ready' && <Body shelf={remote.value} page={page} onPage={goTo} t={t} />}
    </div>
  )
}

function Body({
  shelf,
  page,
  onPage,
  t,
}: {
  shelf: SectionPage
  page: number
  onPage: (page: number) => void
  t: Translate
}) {
  const { section, items, total, limit } = shelf
  const pages = Math.max(1, Math.ceil(total / limit))
  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ margin: 0 }} className="shelf-title">
          {section.icon && <span aria-hidden="true">{section.icon}</span>}
          {section.title}
        </h1>
        {section.description && <div className="card-meta">{section.description}</div>}
        <div className="card-meta">{t('shelf.count', total)}</div>
      </div>

      {total === 0 ? (
        <div className="card-meta">{t('shelf.empty')}</div>
      ) : items.length === 0 ? (
        // A page past the end: an old link, or series taken off since.
        <button type="button" className="btn btn-secondary" onClick={() => onPage(pages)}>
          {t('library.pageGo', pages)}
        </button>
      ) : (
        <div className="stack gap-4">
          <div className="grid-series">
            {items.map((playlist) => (
              <SeriesCard key={playlist.id} playlist={playlist} t={t} />
            ))}
          </div>
          {pages > 1 && <Pager page={page} pages={pages} onPage={onPage} t={t} />}
        </div>
      )}
    </>
  )
}
