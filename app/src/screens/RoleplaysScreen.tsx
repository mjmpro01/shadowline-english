import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n, type Translate } from '../i18n'
import { Icon } from '../components/Icon'
import { Loading } from '../components/LoadState'
import { explain } from '../lib/errors'
import { useRemote } from '../lib/remote'
import { roleplayName, useTutorEnabled } from '../lib/roleplay'
import { repository, type Roleplay } from '../repository'

/**
 * Role-play with the tutor: a job interview or a presentation to start, and
 * the sessions played before, to read again.
 */
export function RoleplaysScreen() {
  const { t, locale } = useI18n()
  const enabled = useTutorEnabled()
  const remote = useRemote('', () => repository.roleplays())
  const [sessions, setSessions] = useState<Roleplay[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (remote.state === 'ready') setSessions(remote.value)
  }, [remote])

  const remove = async (r: Roleplay) => {
    if (!window.confirm(t('roleplay.confirmDelete', roleplayName(r, t)))) return
    try {
      await repository.deleteRoleplay(r.id)
      setSessions((all) => all?.filter((s) => s.id !== r.id) ?? null)
    } catch (err) {
      setError(explain(err, t, t('common.loadFailed')))
    }
  }

  return (
    <div className="stack gap-6">
      <Link to="/dialogues" className="link-button row gap-1" style={{ alignSelf: 'flex-start' }}>
        <Icon name="chevron-left" size={16} />
        {t('dialogue.back')}
      </Link>
      <div className="stack" style={{ gap: 4 }}>
        <h1 style={{ margin: 0 }}>{t('roleplay.title')}</h1>
        <div className="card-meta">{t('roleplay.intro')}</div>
      </div>

      {enabled === null ? (
        <Loading />
      ) : !enabled ? (
        <div className="card-meta">{t('roleplay.noTutor')}</div>
      ) : (
        <>
          <div className="grid-dialogues">
            <Scenario scenario="interview" t={t} />
            <Scenario scenario="presentation" t={t} />
          </div>
          <div className="card-meta">{t('roleplay.fromDialogue')}</div>
        </>
      )}

      {error && (
        <div className="card-meta" role="alert">
          {error}
        </div>
      )}

      <section className="stack gap-2" aria-labelledby="roleplay-history">
        <h2 id="roleplay-history" className="card-kicker" style={{ margin: 0 }}>
          {t('roleplay.history')}
        </h2>
        {remote.state === 'error' ? (
          <div className="card-meta">{remote.message}</div>
        ) : sessions === null ? (
          <Loading />
        ) : sessions.length === 0 ? (
          <div className="card-meta">{t('roleplay.none')}</div>
        ) : (
          sessions.map((r) => (
            <div key={r.id} className="dict-line" data-testid="roleplay-row">
              <Link to={`/dialogues/roleplay/${r.id}`} className="stack" style={{ gap: 2, minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
                <span className="card-title" style={{ fontSize: 15 }}>
                  {roleplayName(r, t)}
                  {r.topic && ` · ${r.topic}`}
                </span>
                <span className="card-meta">
                  {new Date(r.updatedAt).toLocaleDateString(locale)} ·{' '}
                  {r.endedAt ? t('roleplay.ended') : t('roleplay.going')}
                </span>
              </Link>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                title={t('roleplay.delete')}
                aria-label={t('roleplay.delete')}
                onClick={() => void remove(r)}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  )
}

/** One of the fixed scenarios, with what it is about and the button to start. */
function Scenario({ scenario, t }: { scenario: 'interview' | 'presentation'; t: Translate }) {
  const navigate = useNavigate()
  const [topic, setTopic] = useState('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const start = async (e: React.FormEvent) => {
    e.preventDefault()
    setStarting(true)
    setError('')
    try {
      const session = await repository.startRoleplay({ scenario, topic })
      navigate(`/dialogues/roleplay/${session.id}`)
    } catch (err) {
      setError(explain(err, t, t('common.loadFailed')))
      setStarting(false)
    }
  }

  return (
    <form className="card elev-sm stack gap-2" onSubmit={(e) => void start(e)} aria-label={t(`roleplay.${scenario}`)}>
      <span className="card-title">{t(`roleplay.${scenario}`)}</span>
      <span className="card-meta">{t(`roleplay.${scenario}Body`)}</span>
      <label className="stack" style={{ gap: 4 }}>
        <span className="card-kicker">{t(`roleplay.${scenario}Topic`)}</span>
        <input
          className="input"
          maxLength={120}
          placeholder={t(`roleplay.${scenario}TopicHint`)}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </label>
      {error && (
        <div className="card-meta" role="alert">
          {error}
        </div>
      )}
      <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={starting}>
        <Icon name="messages-square" size={16} />
        {starting ? t('roleplay.starting') : t('roleplay.start')}
      </button>
    </form>
  )
}
