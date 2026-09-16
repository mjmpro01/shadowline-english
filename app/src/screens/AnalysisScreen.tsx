import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { LoadFailure, Loading } from '../components/LoadState'
import { NoSuchClip } from '../components/NoSuchClip'
import { METRIC_NAMES, type Take } from '../data/types'
import { chartFromAnalysis } from '../lib/chart'
import { summariseTake } from '../lib/summary'
import { colorFor, wordScore } from '../lib/score'
import { urlOf, useClipAudio, useTakeAudio } from '../lib/useAudioUrl'
import { useApp } from '../store/context'

export function AnalysisScreen() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const { data, state, statsFor } = useApp()
  const [selected, setSelected] = useState<{ videoId: string; takeId: string } | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const sourceRef = useRef<HTMLAudioElement>(null)

  const video = data.videos.find((v) => v.id === videoId)
  const stats = statsFor(videoId ?? '')
  const chosen =
    selected && selected.videoId === videoId ? stats.takes.find((t) => t.id === selected.takeId) : undefined
  const take = chosen ?? stats.takes[stats.takes.length - 1]

  // Every chart drawn here is a measurement. A take that has not been scored
  // has no contour, and the screen says so rather than drawing a plausible one.
  const measured = take?.analysis ?? null
  const chart = measured ? chartFromAnalysis(measured) : null
  const myVoiceUrl = urlOf(useTakeAudio(take?.hasAudio ? take.id : null))
  const sourceAudio = useClipAudio(video?.id ?? null)
  const sourceUrl = urlOf(sourceAudio)

  if (state === 'loading') return <Loading />
  if (state === 'error') return <LoadFailure />
  if (!video) return <NoSuchClip />

  if (!take) {
    return (
      <div className="stack gap-4">
        <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/library')}>
          <Icon name="chevron-left" />
          Library
        </button>
        <h2 style={{ marginBottom: 4 }}>{video.title}</h2>
        <div className="card elev-sm">
          <div className="card-body">No takes recorded yet — practice this clip to see your pitch analysis.</div>
          <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => navigate(`/library/${video.id}/practice`)}>
            Start practising
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="stack gap-6" style={{ maxWidth: 720 }}>
      <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/library')}>
        <Icon name="chevron-left" />
        Library
      </button>

      <div>
        <h2 style={{ marginBottom: 4 }}>{video.title}</h2>
        <div className="card-meta">
          {video.source} · <span className="mono">{video.timestamp}</span>
        </div>
      </div>

      <div className="seg" style={{ alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' }}>
        {stats.takes.map((t, i) => (
          <label className="seg-opt mono" key={t.id}>
            <input
              type="radio"
              name="take"
              checked={t.id === take.id}
              onChange={() => setSelected({ videoId: video.id, takeId: t.id })}
            />
            Take {i + 1}
          </label>
        ))}
      </div>

      <div style={{ fontSize: 19, lineHeight: 2.1 }}>
        {video.title.split(' ').map((word, i) => (
          <span
            key={`${word}-${i}`}
            style={{
              borderBottom: `3px solid ${colorFor(wordScore(word, take.score ?? 60))}`,
              padding: '2px 3px',
              marginRight: 2,
            }}
          >
            {word}
          </span>
        ))}
      </div>

      <div className="card elev-sm">
        <div className="row between wrap gap-2">
          <div className="row gap-2">
            <div className="card-kicker">Pitch contour</div>
            <span className="tag tag-accent-2">measured</span>
          </div>
          <div className="row gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!sourceUrl}
              title={sourceUrl ? "Play the clip's original audio" : 'No original audio attached to this clip'}
              onClick={() => sourceRef.current?.play()}
            >
              <Icon name="play" size={14} />
              Original
            </button>
            {sourceUrl && <audio ref={sourceRef} src={sourceUrl} />}
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!myVoiceUrl}
              title={myVoiceUrl ? 'Play this take' : 'This take has no recording'}
              onClick={() => audioRef.current?.play()}
            >
              <Icon name="play" size={14} />
              My take
            </button>
            {myVoiceUrl && <audio ref={audioRef} src={myVoiceUrl} />}
          </div>
        </div>

        {chart === null ? (
          <div className="card-meta" style={{ padding: '32px 0' }}>{contourPending(take)}</div>
        ) : (
        <svg width="100%" viewBox="0 0 640 200" style={{ display: 'block' }} aria-label="Pitch contour chart">
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
        <div className="row between mono" style={{ marginTop: 2, fontSize: 11, color: 'var(--color-neutral-600)' }}>
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
              <span style={{ fontSize: 12, opacity: 0.7 }}>Source (±1 semitone)</span>
            </div>
          )}
          <div className="row gap-2">
            <div style={{ width: 14, height: 3, background: 'var(--score-good)', borderRadius: 2 }} />
            <span style={{ fontSize: 12, opacity: 0.7 }}>You</span>
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
          <div className="card-kicker">{take.status === 'pending' ? 'Measuring' : 'Not scored'}</div>
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
        <div className="card-kicker">Summary</div>
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
        Watch dub playback
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
