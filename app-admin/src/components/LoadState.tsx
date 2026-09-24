import { useT } from '../i18n'

/** What a screen shows while it is talking to the server. The console has no
 *  store to fail as a whole — each screen fetches what it shows and says so
 *  itself — so there is no LoadFailure here. */
export function Loading({ label }: { label?: string }) {
  const t = useT()
  return (
    <div className="stack gap-2" style={{ padding: 32, alignItems: 'center' }} role="status">
      <div className="card-meta">{label ?? t('common.loading')}</div>
    </div>
  )
}
