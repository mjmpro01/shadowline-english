import { useNavigate, useParams } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { ClipPreview } from '../components/ClipPreview'
import { Loading } from '../components/LoadState'
import { useRemote } from '../lib/remote'
import { clock } from '../lib/time'
import { repository } from '../repository'

/**
 * One episode in the dictation tab: the line to start at. The passage runs on
 * from it through the lines after, for half a minute to a minute and a half.
 */
export function DictationEpisodeScreen() {
  const { episodeId } = useParams()
  const navigate = useNavigate()
  const t = useT()
  const remote = useRemote(episodeId ?? '', (id) => repository.episode(id))
  const start = (clipId: string) => navigate(`/dictation/e/${episodeId ?? ''}/${clipId}`)

  return (
    <div className="stack gap-4">
      <button
        type="button"
        className="btn btn-ghost"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => navigate('/dictation')}
      >
        <Icon name="chevron-left" />
        {t('nav.dictation')}
      </button>

      {remote.state === 'loading' && <Loading />}
      {remote.state === 'error' && (
        <div className="card-meta">{remote.status === 404 ? t('episode.notFound') : remote.message}</div>
      )}
      {remote.state === 'ready' && (
        <>
          <div className="stack" style={{ gap: 4 }}>
            <h1 style={{ margin: 0 }}>{remote.value.episode.title}</h1>
            <div className="card-meta">{t('dictation.pickLine')}</div>
          </div>
          {remote.value.clips.length === 0 ? (
            <div className="card-meta">{t('episode.noClips')}</div>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => start(remote.value.clips[0].id)}
              >
                <Icon name="square-pen" size={14} />
                {t('dictation.fromStart')}
              </button>
              <div className="stack gap-2">
                {remote.value.clips.map((clip, i) => (
                  // The line itself is not shown: reading it here would give
                  // away the passage about to be written down.
                  <div key={clip.id} className="card elev-sm dict-start-row" data-testid="dict-start-line">
                    <ClipPreview clip={clip} label={t('dictation.lineN', i + 1)} />
                    <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                      <strong>{t('dictation.lineN', i + 1)}</strong>
                      <span className="card-meta mono">
                        {clip.timestamp} · {clock(clip.durationSeconds)}
                      </span>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={() => start(clip.id)}>
                      <Icon name="square-pen" size={14} />
                      {t('dictation.fromHere')}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
