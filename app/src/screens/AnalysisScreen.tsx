import { useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { METRIC_NAMES } from '../data/types'
import { buildChart, colorFor, wordScore } from '../lib/score'
import { useBlobUrl } from '../lib/useAudioUrl'
import { useApp } from '../store/context'

export function AnalysisScreen() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const { data, statsFor } = useApp()
  const [selected, setSelected] = useState<{ videoId: string; takeId: string } | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const video = data.videos.find((v) => v.id === videoId)
  const stats = statsFor(videoId ?? '')
  const chosen =
    selected && selected.videoId === videoId ? stats.takes.find((t) => t.id === selected.takeId) : undefined
  const take = chosen ?? stats.takes[stats.takes.length - 1]

  const chart = buildChart(`${video?.id ?? ''}-${take?.id ?? ''}`, take?.score ?? 0)
  const myVoiceUrl = useBlobUrl(take?.audioKey ?? null)

  if (!video) return <Navigate to="/library" replace />

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
              borderBottom: `3px solid ${colorFor(wordScore(word, take.score))}`,
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
          <div className="card-kicker">Pitch contour</div>
          <div className="row gap-2">
            <button type="button" className="btn btn-secondary" disabled title="Source clip audio isn't wired up yet">
              <Icon name="play" size={14} />
              Original
            </button>
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

        <div className="row between mono" style={{ marginTop: 2, fontSize: 11, color: 'var(--color-neutral-600)' }}>
          {chart.xLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>

        <div className="row gap-4" style={{ marginTop: 'var(--space-2)' }}>
          <div className="row gap-2">
            <div style={{ width: 14, height: 2, background: 'var(--color-neutral-600)' }} />
            <span style={{ fontSize: 12, opacity: 0.7 }}>Source (±1 semitone)</span>
          </div>
          <div className="row gap-2">
            <div style={{ width: 14, height: 3, background: 'var(--score-good)', borderRadius: 2 }} />
            <span style={{ fontSize: 12, opacity: 0.7 }}>You</span>
          </div>
        </div>
      </div>

      <div className="grid-scores">
        {METRIC_NAMES.map((name) => {
          const value = take.scores[name]
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

      <div className="card elev-sm">
        <div className="card-kicker">Summary</div>
        <div style={{ fontSize: 15, lineHeight: 1.6 }}>{video.summary}</div>
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
