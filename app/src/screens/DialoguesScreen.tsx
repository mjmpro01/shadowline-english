import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Loading } from '../components/LoadState'
import { topicsOf } from '../lib/dialogue'
import { useRemote } from '../lib/remote'
import { repository } from '../repository'

/** The dialogues to learn, by topic, each with how much of it is known. */
export function DialoguesScreen() {
  const t = useT()
  const remote = useRemote('', () => repository.dialogues())
  const [topic, setTopic] = useState('')

  return (
    <div className="stack gap-6">
      <div className="row between gap-3" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 4, flex: '1 1 320px' }}>
          <h1 style={{ margin: 0 }}>{t('nav.dialogues')}</h1>
          <div className="card-meta">{t('dialogue.intro')}</div>
        </div>
        <Link to="/dialogues/phrasebook" className="btn btn-secondary">
          <Icon name="notebook-pen" size={16} />
          {t('phrasebook.title')}
        </Link>
      </div>

      {remote.state === 'loading' ? (
        <Loading />
      ) : remote.state === 'error' ? (
        <div className="card-meta">{remote.message}</div>
      ) : remote.value.length === 0 ? (
        <div className="card-meta">{t('dialogue.none')}</div>
      ) : (
        <>
          <div className="row gap-2" role="group" aria-label={t('dialogue.topics')} style={{ flexWrap: 'wrap' }}>
            {['', ...topicsOf(remote.value)].map((name) => (
              <button
                key={name}
                type="button"
                className="dict-chip"
                aria-pressed={topic === name}
                onClick={() => setTopic(name)}
              >
                {name || t('dialogue.all')}
              </button>
            ))}
          </div>
          <div className="grid-dialogues">
            {remote.value
              .filter((d) => topic === '' || d.topic === topic)
              .map((d) => (
                <Link key={d.id} to={`/dialogues/${d.slug}`} className="card elev-sm dialogue-card">
                  <span className="row between gap-2">
                    <span className="card-kicker">{d.topic}</span>
                    <span className="tag tag-outline">{d.level}</span>
                  </span>
                  <span className="card-title">{d.title}</span>
                  <span className="card-meta clamp-2">{d.situation}</span>
                  <span className="stack" style={{ gap: 4, marginTop: 'auto' }}>
                    <span className="progress-track" aria-hidden="true">
                      <span className="progress-fill" style={{ width: `${(100 * d.known) / Math.max(1, d.lines)}%`, display: 'block' }} />
                    </span>
                    <span className="card-meta">{t('dialogue.knownOf', d.known, d.lines)}</span>
                  </span>
                </Link>
              ))}
          </div>
        </>
      )}
    </div>
  )
}
