import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { NEED_PRACTICE } from '../data/seed'
import { METRIC_NAMES, type MetricName } from '../data/types'
import { colorFor } from '../lib/score'
import { useApp } from '../store/context'

type Filter = 'All' | MetricName

const W = 640
const H = 180
const PAD_L = 30
const PAD_R = 10
const PAD_T = 20
const PAD_B = 24

export function ProgressScreen() {
  const { data } = useApp()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('All')

  const series = useMemo(() => {
    const byDay = new Map<string, number[]>()
    for (const take of data.takes) {
      if (take.score === null || take.scores === null) continue
      const day = take.recordedAt.slice(0, 10)
      const value = filter === 'All' ? take.score : take.scores[filter]
      byDay.set(day, [...(byDay.get(day) ?? []), value])
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-10)
      .map(([day, values]) => ({
        day,
        label: `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`,
        value: Math.round(values.reduce((sum, v) => sum + v, 0) / values.length),
      }))
  }, [data.takes, filter])

  const dots = series.map((point, i) => ({
    ...point,
    cx: PAD_L + (i / Math.max(1, series.length - 1)) * (W - PAD_L - PAD_R),
    cy: PAD_T + (1 - point.value / 100) * (H - PAD_T - PAD_B),
  }))
  const linePoints = dots.map((d) => `${d.cx.toFixed(1)},${d.cy.toFixed(1)}`).join(' ')

  const suggested = data.videos.find((v) => v.id === 'v5') ?? data.videos[0]

  const goPractice = (videoId: string) => navigate(`/library/${videoId}/practice`)

  return (
    <div className="stack gap-6">
      <h1>Progress</h1>

      <div className="row gap-2 wrap">
        {(['All', ...METRIC_NAMES] as Filter[]).map((option) => (
          <button
            type="button"
            key={option}
            className={`btn ${filter === option ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="card elev-sm">
        <svg width="100%" viewBox="0 0 640 180" style={{ display: 'block' }} aria-label="Average score over time">
          <line x1="30" y1="20" x2="630" y2="20" stroke="var(--color-divider)" />
          <line x1="30" y1="90" x2="630" y2="90" stroke="var(--color-divider)" />
          <line x1="30" y1="156" x2="630" y2="156" stroke="var(--color-divider)" />
          <text x="4" y="24" fill="var(--color-text)" opacity="0.5" fontSize="11" fontFamily="var(--font-mono)">
            100
          </text>
          <text x="8" y="94" fill="var(--color-text)" opacity="0.5" fontSize="11" fontFamily="var(--font-mono)">
            50
          </text>
          <text x="10" y="160" fill="var(--color-text)" opacity="0.5" fontSize="11" fontFamily="var(--font-mono)">
            0
          </text>
          <polyline points={linePoints} fill="none" stroke="var(--score-good)" strokeWidth="2.5" />
          {dots.map((dot) => (
            <circle key={dot.day} cx={dot.cx} cy={dot.cy} r="4" fill={colorFor(dot.value)} />
          ))}
        </svg>
        <div className="row between mono" style={{ marginTop: 2, fontSize: 10, color: 'var(--color-neutral-600)' }}>
          {dots.map((dot) => (
            <span key={dot.day}>{dot.label}</span>
          ))}
        </div>
      </div>

      <div className="stack gap-2">
        <div className="card-kicker">Need practice</div>
        {NEED_PRACTICE.map((item) => (
          <div className="card elev-sm row between gap-3" key={item.id}>
            <div>
              <div className="card-title" style={{ fontSize: 15 }}>
                {item.title}
              </div>
              <div className="card-meta">{item.detail}</div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flexShrink: 0 }}
              onClick={() => goPractice(item.videoId)}
            >
              Practice now
            </button>
          </div>
        ))}
      </div>

      {suggested && (
        <div>
          <div className="card-kicker" style={{ marginBottom: 'var(--space-2)' }}>
            Next up
          </div>
          <button
            type="button"
            className="link-button card elev-sm row gap-3"
            style={{ width: '100%', cursor: 'pointer' }}
            onClick={() => goPractice(suggested.id)}
          >
            <span
              className="thumb"
              style={{ width: 52, height: 88, flexShrink: 0, aspectRatio: 'auto' }}
            >
              <Icon name="play" size={20} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="card-title" style={{ fontSize: 15, display: 'block' }}>
                {suggested.title}
              </span>
              <span className="card-meta">{suggested.source}</span>
              <span style={{ fontSize: 13, opacity: 0.75, marginTop: 4, display: 'block' }}>
                Recommended — your stress score has been lowest this week.
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
