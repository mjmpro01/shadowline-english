import { useEffect, useState, type FormEvent } from 'react'
import { Loading } from '../components/LoadState'
import type { WorkerStatus } from '../data/types'
import { useT } from '../i18n'
import type { MessageKey } from '../i18n/en'
import { ApiError } from '../lib/api'
import { repository, type ImportForm, type ImportReport } from '../repository'

const EMPTY: ImportForm = {
  protocol: 'sftp',
  host: '',
  port: 22,
  username: '',
  secretKind: 'password',
  secret: '',
  tlsMode: 'explicit',
  tlsSkipVerify: false,
  hostKey: '',
  inbox: '/inbox',
  processing: '/processing',
  done: '/done',
  failed: '/failed',
  defaultSeries: 'Imported',
  pollSeconds: 300,
}

/** The port a protocol is usually on, to fill in when it changes. */
function usualPort(form: Pick<ImportForm, 'protocol' | 'tlsMode'>): number {
  if (form.protocol === 'sftp') return 22
  return form.tlsMode === 'implicit' ? 990 : 21
}

const PROBLEMS = new Set([
  'unreachable',
  'login',
  'tls',
  'host_key_unknown',
  'host_key_mismatch',
  'no_folder',
  'no_write',
])

/**
 * The file server videos are imported from: where it is, how to sign in, and
 * its folders, with a test that tries it all before it is saved.
 */
export function Import() {
  const t = useT()
  const [form, setForm] = useState<ImportForm | null>(null)
  const [hasSecret, setHasSecret] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [worker, setWorker] = useState<WorkerStatus | null | undefined>(undefined)

  useEffect(() => {
    let wanted = true
    repository
      .importSettings()
      .then((s) => {
        if (!wanted) return
        if (s) {
          const { hasSecret: has, updatedAt: _at, ...rest } = s
          setForm({ ...rest, secret: '' })
          setHasSecret(has)
        } else {
          setForm(EMPTY)
        }
      })
      .catch((err: unknown) => wanted && setProblem(err instanceof ApiError ? err.message : 'Could not load the settings.'))
    repository
      .services()
      .then((s) => wanted && setWorker(s.importer ?? null))
      .catch(() => undefined)
    return () => {
      wanted = false
    }
  }, [])

  if (!form) {
    return problem ? (
      <div className="card-meta" role="alert">
        {problem}
      </div>
    ) : (
      <Loading />
    )
  }

  const set = <K extends keyof ImportForm>(key: K, value: ImportForm[K]) => {
    setSaved(false)
    setForm((f) => {
      if (!f) return f
      const next = { ...f, [key]: value }
      // The port follows the protocol, unless someone has chosen another.
      if ((key === 'protocol' || key === 'tlsMode') && f.port === usualPort(f)) next.port = usualPort(next)
      if (key === 'protocol' && value === 'ftps') next.secretKind = 'password'
      return next
    })
  }

  const test = async () => {
    setTesting(true)
    setProblem(null)
    setReport(null)
    try {
      setReport(await repository.testImport(form))
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not test the connection.')
    } finally {
      setTesting(false)
    }
  }

  const trust = (fingerprint: string) => {
    set('hostKey', fingerprint)
    setReport(null)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setProblem(null)
    try {
      const after = await repository.saveImportSettings(form)
      setHasSecret(after.hasSecret)
      setForm((f) => (f ? { ...f, secret: '' } : f))
      setSaved(true)
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not save the settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="stack gap-3" onSubmit={(e) => void save(e)} aria-label={t('import.title')}>
      <div>
        <h1 style={{ marginBottom: 2 }}>{t('import.title')}</h1>
        <div className="card-meta">{t('import.subtitle')}</div>
        {worker !== undefined && (
          <div className="card-meta" data-testid="importer-status">
            {t('import.worker')}: {worker?.online ? t('import.workerOnline') : t('import.workerOffline')}
          </div>
        )}
      </div>

      <section className="card elev-sm stack gap-3" aria-labelledby="import-server">
        <h2 id="import-server" className="card-kicker" style={{ margin: 0 }}>
          {t('import.server')}
        </h2>
        <div className="row gap-3 wrap" role="radiogroup" aria-label={t('import.protocol')}>
          {(['sftp', 'ftps'] as const).map((p) => (
            <label key={p} className="row gap-1">
              <input type="radio" name="protocol" checked={form.protocol === p} onChange={() => set('protocol', p)} />
              {t(`import.${p}`)}
            </label>
          ))}
        </div>
        <div className="row gap-2 wrap">
          <label className="stack gap-1" style={{ flex: '3 1 240px' }}>
            <span className="card-kicker">{t('import.host')}</span>
            <input
              className="input"
              required
              placeholder="files.example.com"
              value={form.host}
              onChange={(e) => set('host', e.target.value)}
            />
          </label>
          <label className="stack gap-1" style={{ flex: '0 1 100px' }}>
            <span className="card-kicker">{t('import.port')}</span>
            <input
              className="input"
              type="number"
              min={1}
              max={65535}
              value={form.port}
              onChange={(e) => set('port', Number(e.target.value) || 0)}
            />
          </label>
          <label className="stack gap-1" style={{ flex: '2 1 180px' }}>
            <span className="card-kicker">{t('import.username')}</span>
            <input
              className="input"
              required
              autoComplete="off"
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
            />
          </label>
        </div>

        {form.protocol === 'sftp' && (
          <div className="row gap-3 wrap" role="radiogroup" aria-label={t('import.signIn')}>
            <span className="card-kicker">{t('import.signIn')}</span>
            {(['password', 'key'] as const).map((k) => (
              <label key={k} className="row gap-1">
                <input type="radio" name="secretKind" checked={form.secretKind === k} onChange={() => set('secretKind', k)} />
                {t(`import.${k}`)}
              </label>
            ))}
          </div>
        )}
        {form.secretKind === 'key' && form.protocol === 'sftp' ? (
          <div className="stack gap-1">
            <label className="stack gap-1">
              <span className="card-kicker">{t('import.key')}</span>
              <textarea
                className="input mono"
                rows={5}
                spellCheck={false}
                aria-describedby="import-key-hint"
                placeholder={hasSecret ? t('import.secretSaved') : '-----BEGIN OPENSSH PRIVATE KEY-----'}
                value={form.secret}
                onChange={(e) => set('secret', e.target.value)}
              />
            </label>
            <span id="import-key-hint" className="card-meta">
              {t('import.keyHint')}
            </span>
          </div>
        ) : (
          <label className="stack gap-1">
            <span className="card-kicker">{t('import.password')}</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder={hasSecret ? t('import.secretSaved') : ''}
              value={form.secret}
              onChange={(e) => set('secret', e.target.value)}
            />
          </label>
        )}

        {form.protocol === 'ftps' ? (
          <>
            <label className="stack gap-1" style={{ maxWidth: 360 }}>
              <span className="card-kicker">{t('import.tlsMode')}</span>
              <select
                className="input"
                aria-label={t('import.tlsMode')}
                value={form.tlsMode}
                onChange={(e) => set('tlsMode', e.target.value as ImportForm['tlsMode'])}
              >
                <option value="explicit">{t('import.explicit')}</option>
                <option value="implicit">{t('import.implicit')}</option>
              </select>
            </label>
            <label className="row gap-2">
              <input
                type="checkbox"
                checked={form.tlsSkipVerify}
                onChange={(e) => set('tlsSkipVerify', e.target.checked)}
              />
              <span>{t('import.skipVerify')}</span>
            </label>
          </>
        ) : (
          <div className="stack gap-1">
            <span className="card-kicker">{t('import.hostKey')}</span>
            {form.hostKey ? (
              <div className="row gap-2 wrap">
                <code className="mono import-key" data-testid="host-key">
                  {form.hostKey}
                </code>
                <button type="button" className="btn btn-ghost" onClick={() => set('hostKey', '')}>
                  {t('import.forget')}
                </button>
              </div>
            ) : (
              <span className="card-meta">{t('import.hostKeyNone')}</span>
            )}
          </div>
        )}
      </section>

      <section className="card elev-sm stack gap-3" aria-labelledby="import-folders">
        <h2 id="import-folders" className="card-kicker" style={{ margin: 0 }}>
          {t('import.folders')}
        </h2>
        <div className="stack gap-1">
          <label className="stack gap-1">
            <span className="card-kicker">{t('import.inbox')}</span>
            <input
              className="input mono"
              aria-describedby="import-inbox-hint"
              value={form.inbox}
              onChange={(e) => set('inbox', e.target.value)}
            />
          </label>
          <span id="import-inbox-hint" className="card-meta">
            {t('import.inboxHint')}
          </span>
        </div>
        <div className="row gap-2 wrap">
          {(['processing', 'done', 'failed'] as const).map((k) => (
            <label key={k} className="stack gap-1" style={{ flex: '1 1 160px' }}>
              <span className="card-kicker">{t(`import.${k}`)}</span>
              <input className="input mono" value={form[k]} onChange={(e) => set(k, e.target.value)} />
            </label>
          ))}
        </div>
        <span className="card-meta">{t('import.foldersHint')}</span>
        <div className="row gap-2 wrap">
          <label className="stack gap-1" style={{ flex: '2 1 220px' }}>
            <span className="card-kicker">{t('import.defaultSeries')}</span>
            <input className="input" value={form.defaultSeries} onChange={(e) => set('defaultSeries', e.target.value)} />
          </label>
          <label className="stack gap-1" style={{ flex: '0 1 160px' }}>
            <span className="card-kicker">{t('import.poll')}</span>
            <input
              className="input"
              type="number"
              min={1}
              max={1440}
              value={Math.round(form.pollSeconds / 60)}
              onChange={(e) => set('pollSeconds', (Number(e.target.value) || 0) * 60)}
            />
          </label>
        </div>
      </section>

      {problem !== null && (
        <div className="card-meta" role="alert">
          {problem}
        </div>
      )}

      {report && <TestReport report={report} onTrust={trust} />}

      <div className="row gap-2 wrap" style={{ alignItems: 'center' }}>
        <button type="button" className="btn btn-secondary" disabled={testing} onClick={() => void test()}>
          {testing ? t('import.testing') : t('import.test')}
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? t('import.saving') : t('import.save')}
        </button>
        {saved && (
          <span className="card-meta" role="status">
            {t('import.saved')}
          </span>
        )}
      </div>
    </form>
  )
}

/** What the test found, a step at a time, and the host key to trust. */
function TestReport({ report, onTrust }: { report: ImportReport; onTrust: (fingerprint: string) => void }) {
  const t = useT()
  return (
    <section className="card elev-sm stack gap-2" aria-label={t('import.test')} data-testid="import-report">
      <ol className="import-steps">
        {report.steps.map((s) => (
          <li key={s.step} data-ok={s.ok}>
            <span aria-hidden="true">{s.ok ? '✓' : '✗'}</span>{' '}
            <strong>{t(`import.step.${s.step}` as MessageKey)}</strong>
            {!s.ok && (
              <div className="card-meta">
                {t(`import.problem.${s.problem && PROBLEMS.has(s.problem) ? s.problem : 'other'}` as MessageKey)}
                {s.detail && <div className="mono import-detail">{s.detail}</div>}
              </div>
            )}
          </li>
        ))}
      </ol>
      {report.hostKey && (
        <div className="stack gap-1">
          <span className="card-meta">{t('import.trustHint')}</span>
          <code className="mono import-key" data-testid="offered-key">
            {report.hostKey}
          </code>
          <button
            type="button"
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => onTrust(report.hostKey ?? '')}
          >
            {t('import.trust')}
          </button>
        </div>
      )}
      {report.ok && (
        <div className="stack gap-1">
          <strong>{t('import.ok')}</strong>
          <span className="card-meta">{t('import.found', report.videos)}</span>
          {report.files.length > 0 && (
            <ul className="import-files mono">
              {report.files.map((f) => (
                <li key={f.path}>
                  {f.path} <span className="card-meta">→ {f.series}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
