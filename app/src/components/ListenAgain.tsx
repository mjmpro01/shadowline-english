import { useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { useRemote } from '../lib/remote'
import { repository, type Dictation } from '../repository'
import { Icon } from './Icon'

/** How much of a dictation was heard, as a whole percentage. */
export function heardPercent(d: Pick<Dictation, 'right' | 'total'>): number {
  return d.total === 0 ? 100 : Math.round((d.right / d.total) * 100)
}

/**
 * Yesterday's dictations, to be listened to once more: the last step of the
 * method is the next day. Named by episode and line number rather than by the
 * line, which would be the answer to hearing them again with no text. On the dashboard it is nothing at all when none is
 * due; the dictation tab passes `whenNone` to say so instead.
 */
export function ListenAgain({ whenNone }: { whenNone?: string }) {
  const t = useT()
  const navigate = useNavigate()
  const remote = useRemote('', () => repository.dictations())
  const due = remote.state === 'ready' ? remote.value.due : []
  if (due.length === 0 && (!whenNone || remote.state !== 'ready')) return null
  return (
    <section className="card elev-sm stack gap-2" data-testid="listen-again" aria-labelledby="listen-again-title">
      <h2 id="listen-again-title" className="card-kicker" style={{ margin: 0 }}>
        {t('dash.reviewToday')}
      </h2>
      {due.length === 0 ? (
        <div className="card-meta">{whenNone}</div>
      ) : (
        <div className="card-meta">{t('dash.reviewBody')}</div>
      )}
      {due.map((d) => (
        <div key={d.id} className="dict-line">
          <span className="stack" style={{ gap: 2, minWidth: 0 }}>
            <span className="card-title clamp-2" style={{ fontSize: 15 }}>
              {d.episodeTitle}
            </span>
            <span className="card-meta">
              {t('dictation.fromLineN', d.firstLineNumber)} · {t('dictation.accuracy', heardPercent(d))}
            </span>
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate(`/dictation/e/${d.episodeId}/${d.firstClipId}?review=${d.id}`)}
          >
            <Icon name="volume" size={14} />
            {t('dash.reviewOpen')}
          </button>
        </div>
      ))}
    </section>
  )
}
