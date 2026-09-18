import { useT } from '../i18n'
import { useApp } from '../store/context'

/**
 * What the app shows while it is talking to the server, and when it could not.
 *
 * The browser version had neither: a failed load left every screen rendering an
 * empty list, and there was no way to tell that apart from having no clips yet.
 */
export function Loading({ label }: { label?: string }) {
  const t = useT()
  return (
    <div className="stack gap-2" style={{ padding: 32, alignItems: 'center' }} role="status">
      <div className="card-meta">{label ?? t('common.loading')}</div>
    </div>
  )
}

export function LoadFailure() {
  const { error, reload } = useApp()
  const t = useT()
  return (
    <div className="stack gap-3" style={{ padding: 32, maxWidth: 420, margin: '0 auto' }}>
      <h2 style={{ margin: 0 }}>{t('common.cantReach')}</h2>
      <div className="card-meta">{error ?? t('common.somethingWrong')}</div>
      <button type="button" className="btn btn-primary" onClick={() => void reload()}>
        {t('common.retry')}
      </button>
    </div>
  )
}
