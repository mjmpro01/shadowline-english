import { useCallback, useRef, useState } from 'react'
import { useClip } from '../lib/useClip'
import { ConfirmDelete } from '../components/ConfirmDelete'
import { CaptionLine } from '../components/CaptionLine'
import { heardCount, heardIn } from '../lib/words'
import { BackToLibrary } from '../components/BackToLibrary'
import { useNavigate, useParams } from 'react-router-dom'
import { useT } from '../i18n'
import { ClipPlayer } from '../components/ClipPlayer'
import { Icon } from '../components/Icon'
import { LoadFailure, Loading } from '../components/LoadState'
import { NoSuchClip } from '../components/NoSuchClip'
import { METRIC_NAMES, type Take } from '../data/types'
import { chartFromAnalysis } from '../lib/chart'
import { summariseTake } from '../lib/summary'
import { colorFor } from '../lib/score'
import { urlOf, useClipAudio, useClipVideo, useTakeAudio } from '../lib/useAudioUrl'
import { useApp } from '../store/context'

export function AnalysisScreen() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const t = useT()
  const { state, statsFor, deleteTake } = useApp()
  const [selected, setSelected] = useState<{ videoId: string; takeId: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const sourceRef = useRef<HTMLMediaElement | null>(null)
  // Stable, so the element is not detached and reattached every render.
  const attachSource = useCallback((element: HTMLMediaElement | null) => {
    sourceRef.current = element
  }, [])

  const { clip: video, loading: clipLoading } = useClip(videoId)
  const stats = statsFor(videoId ?? '')
  const chosen =
    selected && selected.videoId === videoId ? stats.takes.find((one) => one.id === selected.takeId) : undefined
  const take = chosen ?? stats.takes[stats.takes.length - 1]
  // Which of the line's words the transcriber heard in this take.
  const checked = take?.analysis?.words

  // Every chart drawn here is a measurement. A take that has not been scored
  // has no contour, and the screen says so rather than drawing a plausible one.
  const measured = take?.analysis ?? null
  const chart = measured ? chartFromAnalysis(measured) : null
  const myVoiceUrl = urlOf(useTakeAudio(take?.hasAudio ? take.id : null))
  const sourceAudio = useClipAudio(video?.id ?? null, Boolean(video?.audioPending))
  const sourceUrl = urlOf(sourceAudio)
  const sourceVideoUrl = urlOf(useClipVideo(video?.id ?? null, Boolean(video?.videoPending)))
  const playable = sourceVideoUrl ?? sourceUrl

  // The clip arrives on its own now rather than with everything else, so
  // waiting for it is a state of this screen and not of the whole app.
  if (state === 'loading' || clipLoading) return <Loading />
  if (state === 'error') return <LoadFailure />
  if (!video) return <NoSuchClip />

  if (!take) {
    return (
      <div className="stack gap-4">
        <BackToLibrary clip={video} />
        <h2 style={{ marginBottom: 4 }}>{video.title}</h2>
        <div className="card elev-sm">
          <div className="card-body">{t('analysis.noTakes')}</div>
          <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => navigate(`/library/${video.id}/practice`)}>
            Start practising
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="stack gap-6" style={{ maxWidth: 720 }}>
      <BackToLibrary clip={video} />

      <div>
        <h2 style={{ marginBottom: 4 }}>{video.title}</h2>
        <div className="card-meta">
          {video.source} · <span className="mono">{video.timestamp}</span>
        </div>
      </div>

      <div className="row between wrap gap-2">
        <div className="seg" style={{ maxWidth: '100%', overflowX: 'auto' }}>
          {/* `option`, not `t`, so the translate function is not shadowed. */}
          {stats.takes.map((option, i) => (
            <label className="seg-opt mono" key={option.id}>
              <input
                type="radio"
                name="take"
                checked={option.id === take.id}
                onChange={() => setSelected({ videoId: video.id, takeId: option.id })}
              />
              {t('analysis.take', i + 1)}
            </label>
          ))}
        </div>
        {/* A bad take sits in the history, on the chart, and in the average
            the leaderboard reads. The server has always allowed this; nothing
            in the app offered it. */}
        <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
          {t('take.delete')}
        </button>
      </div>

      {confirming && (
        <ConfirmDelete
          title={t('take.deleteTitle')}
          body={t('take.deleteBody', stats.takes.length)}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            // Off the selection first: the take about to go is the one the
            // screen is drawing, and it should fall back to the newest rather
            // than to a row that no longer exists.
            setSelected(null)
            void deleteTake(take.id)
          }}
        />
      )}

      {/* The line, with the words the transcriber did not hear marked.
          This used to be the clip's *title*, underlined in colours derived
          from a hash of each word — a per-word measurement that had never been
          measured. There is a real one now, so it says that instead, and says
          nothing at all when there is nothing to say. */}
      <div className="stack gap-2">
        <div style={{ fontSize: 19, lineHeight: 2.1, fontStyle: 'italic' }}>
          “
          {video.captions.map((caption, i) => (
            <CaptionLine
              key={`${caption.text}-${i}`}
              text={caption.text}
              heard={heardIn(checked, video.captions, i)}
            />
          ))}
          ”
        </div>
        {checked ? (
          <div className="card-meta" data-testid="words-heard">
            {t('analysis.wordsHeard', heardCount(checked).heard, heardCount(checked).total)}
            {heardCount(checked).heard < heardCount(checked).total && ` · ${t('analysis.wordsHint')}`}
          </div>
        ) : (
          <div className="card-meta">{t('analysis.wordsUnchecked')}</div>
        )}
      </div>

      <div className="card elev-sm">
        <div className="row between wrap gap-2">
          <div className="row gap-2">
            <div className="card-kicker">{t('analysis.pitchContour')}</div>
            <span className="tag tag-accent-2">measured</span>
          </div>
          <div className="row gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!playable}
              title={playable ? t('analysis.playOriginal') : t('analysis.noOriginalAttached')}
              onClick={() => void sourceRef.current?.play()}
            >
              <Icon name="play" size={14} />
              {t('analysis.original')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!myVoiceUrl}
              title={myVoiceUrl ? t('analysis.playTake') : t('analysis.takeNoAudio')}
              onClick={() => audioRef.current?.play()}
            >
              <Icon name="play" size={14} />
              {t('analysis.myTake')}
            </button>
            {myVoiceUrl && <audio ref={audioRef} src={myVoiceUrl} />}
          </div>
        </div>

        {/* Above the contour, not beside it: the picture and the chart are read
            one after the other, and side by side leaves neither room. */}
        <ClipPlayer attach={attachSource} videoUrl={sourceVideoUrl} audioUrl={sourceUrl} />

        {chart === null ? (
          <div className="card-meta" style={{ padding: '32px 0' }}>{contourPending(take)}</div>
        ) : (
        <svg width="100%" viewBox="0 0 640 200" style={{ display: 'block' }} aria-label={t('analysis.chartLabel')}>
          <path d={chart.bandPath} fill="var(--color-neutral-300)" opacity="0.5" stroke="none" />
          {chart.gridLines.map((line) => (
            <line key={line.label} x1="30" y1={line.y} x2="630" y2={line.y} stroke="var(--color-divider)" strokeWidth="1" />
          ))}
          {chart.gridLines.map((line) => (
            <text
              key={`t-${line.label}`}
              x="4"
              y={Number(line.y) + 4}
              fill="var(--color-text)"
              opacity="0.5"
              fontSize="11"
              fontFamily="var(--font-mono)"
            >
              {line.label}
            </text>
          ))}
          <polyline
            points={chart.refPoints}
            fill="none"
            stroke="var(--color-neutral-600)"
            strokeWidth="1.5"
            strokeDasharray="4,4"
          />
          {chart.segments.map((seg, i) => (
            <line
              key={i}
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
              stroke={seg.color}
              strokeWidth="3"
              strokeLinecap="round"
            />
          ))}
        </svg>
        )}

        {chart && (
        <div className="row between mono" style={{ marginTop: 2, fontSize: 13, color: 'var(--color-neutral-600)' }}>
          {chart.xLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        )}

        {chart && (
        <div className="row gap-4" style={{ marginTop: 'var(--space-2)' }}>
          {chart.refPoints && (
            <div className="row gap-2">
              <div style={{ width: 14, height: 2, background: 'var(--color-neutral-600)' }} />
              <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{t('analysis.source')}</span>
            </div>
          )}
          <div className="row gap-2">
            <div style={{ width: 14, height: 3, background: 'var(--score-good)', borderRadius: 2 }} />
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{t('analysis.you')}</span>
          </div>
        </div>
        )}
      </div>

      {take.scores ? (
        <div className="grid-scores">
          {METRIC_NAMES.map((name) => {
            const value = (take.scores as Record<string, number>)[name]
            return (
              <div className="card elev-sm gap-1" key={name}>
                <div className="card-kicker">{name}</div>
                <div className="mono" style={{ fontSize: 28, color: colorFor(value) }}>
                  {value}
                </div>
                <div className="meter">
                  <span style={{ width: `${value}%`, background: colorFor(value) }} />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card elev-sm stack gap-2">
          <div className="card-kicker">{take.status === 'pending' ? t('analysis.measuring') : t('practice.notScored')}</div>
          <div style={{ fontSize: 14, opacity: 0.8 }}>{unscoredReason(take, sourceAudio.status === 'none')}</div>
          {take.status !== 'pending' && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => navigate(`/library/${video.id}/practice`)}
            >
              Record another take
            </button>
          )}
        </div>
      )}

      <div className="card elev-sm">
        <div className="card-kicker">{t('analysis.summary')}</div>
        <div style={{ fontSize: 15, lineHeight: 1.6 }}>
          {take.scores
            ? summariseTake(take.scores, take.analysis?.meanDeviation ?? null)
            : video.summary}
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => navigate(`/library/${video.id}/dub`)}
      >
        {t('analysis.watchDub')}
      </button>
    </div>
  )
}

/** What to say in place of a contour that is not there. */
function contourPending(take: Take): string {
  if (take.status === 'pending') return 'Measuring your pitch…'
  if (take.status === 'failed') return 'This recording could not be measured.'
  return 'No contour for this take.'
}

/**
 * Why a take has no score. Three different reasons, and conflating them is how
 * a learner ends up believing the app is broken when it is waiting, or waiting
 * when it has given up.
 */
function unscoredReason(take: Take, clipHasNoAudio: boolean): string {
  if (take.status === 'pending') return 'Your take is being scored — this usually takes a moment.'
  if (take.status === 'failed') {
    return take.error
      ? `We couldn’t score this one: ${take.error}.`
      : 'We couldn’t score this one.'
  }
  if (clipHasNoAudio) {
    return "Scores compare your delivery with the clip’s original audio, which this clip is missing."
  }
  return 'This take has no score.'
}
