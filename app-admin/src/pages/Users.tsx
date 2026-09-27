import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { Dialog } from '../components/Dialog'
import { Loading } from '../components/LoadState'
import { ApiError } from '../lib/api'
import { useDebounced } from '../lib/remote'
import { useSession } from '../session'
import { repository, type Account, type AccountFilter } from '../repository'

/** Rows per page, as the server's default. */
const PAGE = 50

/**
 * Everybody who has signed in, and what they may do.
 *
 * Admin rights used to come only from ADMIN_EMAILS, re-read at every sign-in, so
 * the one way to make somebody an admin was to edit the server's environment and
 * redeploy. Those addresses are still the owners — shown, and out of reach here —
 * and everybody else is given or loses admin rights, or is suspended, from this
 * page, at once.
 */
export function Users() {
  const { t, locale } = useI18n()
  const session = useSession()
  const me = session.state === 'ready' ? session.user?.id : undefined

  const [query, setQuery] = useState('')
  const settled = useDebounced(query.trim(), 250)
  const [filter, setFilter] = useState<AccountFilter>('')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<{ users: Account[]; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [suspending, setSuspending] = useState<Account | null>(null)

  const load = useCallback(async () => {
    try {
      setPage(await repository.accounts(settled, filter, PAGE, offset))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the users.')
    }
  }, [settled, filter, offset])

  useEffect(() => {
    // Every setState inside load() runs after an await.
    // eslint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  const change = async (account: Account, access: { admin?: boolean; suspended?: boolean }) => {
    setBusy(account.id)
    setError(null)
    try {
      const updated = await repository.setAccess(account.id, access)
      // Replaced in place: the row stays where the admin was looking, even when
      // the filter it was found under no longer fits it.
      setPage((current) =>
        current && {
          ...current,
          users: current.users.map((one) => (one.id === updated.id ? updated : one)),
        },
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change that.')
    } finally {
      setBusy(null)
    }
  }

  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale) : t('users.never'))

  return (
    <div className="stack gap-3">
      <div>
        <h1 style={{ marginBottom: 2 }}>{t('users.title')}</h1>
        <div className="card-meta">{page === null ? '—' : t('users.count', page.total)}</div>
      </div>

      <div className="row gap-2 wrap">
        <input
          className="input"
          style={{ flex: '1 1 220px' }}
          placeholder={t('users.find')}
          aria-label={t('users.findLabel')}
          value={query}
          onChange={(e) => {
            // A new search starts at the first page: page four of a shorter
            // list is an empty screen with no reason given.
            setQuery(e.target.value)
            setOffset(0)
          }}
        />
        <select
          className="input"
          style={{ flex: '0 0 auto' }}
          aria-label={t('users.filterLabel')}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as AccountFilter)
            setOffset(0)
          }}
        >
          <option value="">{t('users.all')}</option>
          <option value="admins">{t('users.admins')}</option>
          <option value="suspended">{t('users.suspended')}</option>
        </select>
      </div>

      {error !== null && (
        <div className="card-meta" role="alert">
          {error}
        </div>
      )}
      {page === null && error === null && <Loading />}
      {page !== null && page.users.length === 0 && <div className="card-meta">{t('users.none')}</div>}

      {page !== null && page.users.length > 0 && (
        <div className="card elev-sm table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t('users.person')}</th>
                <th>{t('users.joined')}</th>
                <th>{t('users.lastSignIn')}</th>
                <th className="num">{t('users.takes')}</th>
                <th className="num">{t('users.questions')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {page.users.map((account) => {
                const self = account.id === me
                // Why a button is off, said on the button: an admin looking at a
                // greyed-out control should not have to guess.
                const locked = account.owner
                  ? t('users.ownerLocked')
                  : self
                    ? t('users.selfLocked')
                    : undefined
                return (
                  <tr key={account.id} className={account.suspendedAt ? 'is-suspended' : undefined}>
                    <td>
                      <div className="row gap-1 wrap">
                        <span>{account.name || account.email}</span>
                        {account.owner && <span className="tag tag-accent">{t('users.owner')}</span>}
                        {account.isAdmin && !account.owner && (
                          <span className="tag tag-good">{t('users.admin')}</span>
                        )}
                        {account.suspendedAt && <span className="tag tag-warn">{t('users.suspended')}</span>}
                        {self && <span className="tag tag-outline">{t('users.you')}</span>}
                      </div>
                      {account.name && <div className="card-meta">{account.email}</div>}
                    </td>
                    <td className="mono">{date(account.createdAt)}</td>
                    <td className="mono">{date(account.lastSignedIn)}</td>
                    <td className="num">{account.takes.toLocaleString(locale)}</td>
                    <td className="num">{account.questions.toLocaleString(locale)}</td>
                    <td>
                      <div className="row gap-1" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={locked !== undefined || busy === account.id}
                          title={locked}
                          onClick={() => void change(account, { admin: !account.isAdmin })}
                        >
                          {account.isAdmin ? t('users.removeAdmin') : t('users.makeAdmin')}
                        </button>
                        {account.suspendedAt ? (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={locked !== undefined || busy === account.id}
                            title={locked}
                            onClick={() => void change(account, { suspended: false })}
                          >
                            {t('users.restore')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-danger"
                            disabled={locked !== undefined || busy === account.id}
                            title={locked}
                            onClick={() => setSuspending(account)}
                          >
                            {t('users.suspend')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {page !== null && page.total > PAGE && (
        <div className="row between gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
          >
            {t('users.previous')}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={offset + PAGE >= page.total}
            onClick={() => setOffset(offset + PAGE)}
          >
            {t('users.next')}
          </button>
        </div>
      )}

      {suspending !== null && (
        <Dialog
          title={t('users.suspendTitle')}
          onClose={() => setSuspending(null)}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setSuspending(null)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  const account = suspending
                  setSuspending(null)
                  void change(account, { suspended: true })
                }}
              >
                {t('users.suspend')}
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>{t('users.suspendBody', suspending.name || suspending.email)}</p>
        </Dialog>
      )}
    </div>
  )
}
