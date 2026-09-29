import { useCallback, useEffect, useState } from 'react'
import type { Services, WorkerService, WorkerStatus } from '../data/types'
import { useT } from '../i18n'
import type { MessageKey } from '../i18n/en'
import { ApiError } from '../lib/api'
import { CONSOLE_BUILT_AT, CONSOLE_VERSION, isKnown, sameCode } from '../lib/version'
import { repository } from '../repository'

/** The workers, in the order an admin waits on them. */
const WORKERS: { service: WorkerService; label: MessageKey }[] = [
  { service: 'transcribing', label: 'system.transcribing' },
  { service: 'cutting', label: 'system.cutting' },
  { service: 'scoring', label: 'system.scoring' },
  { service: 'dubbing', label: 'system.dubbing' },
  { service: 'glossing', label: 'system.glossing' },
]

type Health = 'same' | 'different' | 'unknown' | 'offline' | 'never' | 'unreported'

interface Part {
  name: string
  version: string
  startedAt: string | null
  health: Health
}

/**
 * Which code every part of Shadowline is running, side by side.
 *
 * A part left running from before a pull is the usual reason a fix "does not
 * work": the cutter that cut only pictures was one, and nothing on screen said
 * so. The API is the reference — it is what everything else talks to — and any
 * part on a different commit, too old to say, or not running is marked.
 */
export function System() {
  const t = useT()
  const [services, setServices] = useState<Services | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setServices(await repository.services())
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    // Every setState inside load() runs after an await.
    // eslint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  const reference = services?.api?.version ?? ''
  // The API is from before it said which code it runs: nothing can be held
  // against it, and restarting it is the first thing to do.
  const apiOld = services !== null && services.api === null

  const parts: Part[] = services
    ? [
        {
          name: t('system.console'),
          version: CONSOLE_VERSION,
          startedAt: CONSOLE_BUILT_AT || null,
          health: versionHealth(CONSOLE_VERSION, reference),
        },
        {
          name: t('system.api'),
          version: services.api?.version ?? '',
          startedAt: services.api?.startedAt ?? null,
          health: isKnown(services.api?.version) ? 'same' : 'unknown',
        },
        ...WORKERS.map(({ service, label }) => workerPart(t(label), services[service], reference)),
      ]
    : []
  const behind = parts.filter((part) => part.health !== 'same')

  return (
    <div className="stack gap-3">
      <div className="row between wrap gap-2" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{t('system.title')}</h1>
          <div className="card-meta">{t('system.subtitle')}</div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void load()}>
          {t('system.refresh')}
        </button>
      </div>

      {error && <div className="card-meta">{error}</div>}

      {services && (
        <div className={`series-hint ${behind.length ? 'series-hint-warn' : ''}`} role="status">
          {apiOld
            ? t('system.apiOld')
            : behind.length === 0
              ? t('system.allSame', reference)
              : t('system.someBehind', behind.length, reference || '—')}
        </div>
      )}

      {services && (
        <div className="card table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t('system.part')}</th>
                <th>{t('system.version')}</th>
                <th>{t('system.since')}</th>
                <th>{t('system.state')}</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((part) => (
                <tr key={part.name} data-health={part.health}>
                  <td>{part.name}</td>
                  <td className="mono">{part.version || '—'}</td>
                  <td className="mono">{part.startedAt ? new Date(part.startedAt).toLocaleString() : '—'}</td>
                  <td>
                    <span className={`tag ${TAG[part.health]}`}>{t(`system.health.${part.health}`)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {behind.length > 0 && (
        <div className="card stack gap-2">
          <div className="card-kicker">{t('system.howTitle')}</div>
          <p className="card-meta" style={{ margin: 0 }}>
            {t('system.howBody')}
          </p>
          <code className="transcript-status-hint">git pull</code>
          <code className="transcript-status-hint">docker compose up -d --build</code>
          <code className="transcript-status-hint">{t('system.howDev')}</code>
        </div>
      )}
    </div>
  )
}

const TAG: Record<Health, string> = {
  same: 'tag-good',
  different: 'tag-warn',
  unknown: 'tag-warn',
  offline: 'tag-bad',
  never: 'tag-neutral',
  unreported: 'tag-neutral',
}

function versionHealth(version: string | undefined, reference: string): Health {
  if (!isKnown(version)) return 'unknown'
  return sameCode(version, reference) ? 'same' : 'different'
}

function workerPart(name: string, worker: WorkerStatus | null | undefined, reference: string): Part {
  if (worker === undefined) return { name, version: '', startedAt: null, health: 'unreported' }
  if (worker === null) return { name, version: '', startedAt: null, health: 'never' }
  const version = worker.version ?? ''
  return {
    name,
    version,
    startedAt: worker.startedAt ?? null,
    health: worker.online ? versionHealth(version, reference) : 'offline',
  }
}
