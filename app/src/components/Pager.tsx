import type { Translate } from '../i18n'
import { pageNumbers } from '../lib/library'
import { Icon } from './Icon'

/** Previous, the page numbers, next. On a phone the numbers give way to
 *  "Page 2/3"; see .pager in app.css. */
export function Pager({
  page,
  pages,
  onPage,
  t,
}: {
  page: number
  pages: number
  onPage: (page: number) => void
  t: Translate
}) {
  return (
    <nav className="pager" aria-label={t('library.pages')}>
      <button
        type="button"
        className="btn btn-secondary pager-step"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <Icon name="chevron-left" size={16} />
        <span className="pager-label">{t('library.pagePrev')}</span>
      </button>
      <span className="pager-numbers">
        {pageNumbers(page, pages).map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className="pager-gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              type="button"
              key={n}
              className={`pager-number${n === page ? ' is-current' : ''}`}
              aria-current={n === page ? 'page' : undefined}
              aria-label={t('library.pageGo', n)}
              onClick={() => onPage(n)}
            >
              {n}
            </button>
          ),
        )}
      </span>
      <span className="pager-of card-meta">{t('library.pageOf', page, pages)}</span>
      <button
        type="button"
        className="btn btn-secondary pager-step"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        <span className="pager-label">{t('library.pageNext')}</span>
        <Icon name="chevron-right" size={16} />
      </button>
    </nav>
  )
}
