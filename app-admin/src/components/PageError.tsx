import { Link, useRouteError } from 'react-router-dom'
import { useT } from '../i18n'

/**
 * What a page shows when it throws, inside the console rather than instead of it.
 *
 * Without this a crash replaced the whole console with React Router's developer
 * page — no menu, no way on. Most crashes here have been a console newer than
 * the API it talks to, so the System page is one click away.
 */
export function PageError() {
  const t = useT()
  const error = useRouteError()
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="card stack gap-2" role="alert">
      <h1 style={{ margin: 0 }}>{t('pageError.title')}</h1>
      <p className="card-meta" style={{ margin: 0 }}>
        {t('pageError.body')}
      </p>
      <code className="transcript-status-hint">{message}</code>
      <div className="row gap-2 wrap">
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          {t('pageError.reload')}
        </button>
        <Link className="btn btn-secondary" to="/system">
          {t('pageError.system')}
        </Link>
      </div>
    </div>
  )
}
