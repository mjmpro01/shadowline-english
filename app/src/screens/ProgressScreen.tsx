import { useEffect, useMemo, useState } from 'react'
import { useRemote } from '../lib/remote'
import { repository } from '../repository'
import { useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { ClipFace } from '../components/ClipFace'
import { Icon } from '../components/Icon'
import { needsPractice, weakestOverall } from '../lib/practice'
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
  const { data, ensureClips } = useApp()
  const navigate = useNavigate()
  const t = useT()
  const [filter, setFilter] = useState<Filter>('All')

  // The clips you scored lowest, rather than three hand-written rows pointing
  // at clip ids a real library would not have. Worked out from takes alone;
  // the three clips it names are then fetched, because the app no longer holds
  // the library to look a name up in.
  const suggestions = needsPractice(data.takes)
  const suggestedIds = suggestions.map((item) => item.videoId).join(',')
  useEffect(() => {
    if (suggestedIds) void ensureClips(suggestedIds.split(','))
  }, [suggestedIds, ensureClips])
  const titleOf = (videoId: string) =>
    data.videos.find((video) => video.id === videoId)?.title ?? ''

  // What to practise next is a question about the whole library, so the server
  // answers it.
  const upNext = useRemote('', () => repository.nextUp())
  const suggested = upNext.state === 'ready' ? upNext.value : null

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

  /* What to practise next, and why — both measured rather than asserted.
     `v5` was a prototype clip id no real library has, so this always fell
     through to whichever clip happened to be first, and offered it under a
     sentence claiming a stress score had been measured and found wanting. With
     no takes recorded at all, there was no such score to have. */
  const weakest = weakestOverall(data.takes)
  const practised = new Set(data.takes.map((take) => take.videoId))

  const goPractice = (videoId: string) => navigate(`/library/${videoId}/practice`)

  return (
    <div className="stack gap-6">
      <h1>{t('progress.title')}</h1>

      <div className="row gap-2 wrap">
        {(['All', ...METRIC_NAMES] as Filter[]).map((option) => (
          <button
            type="button"
            key={option}
            className={`btn ${filter === option ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(option)}
          >
            {option === 'All' ? t('progress.all') : t(`metric.${option}`)}
          </button>
        ))}
      </div>

      {/* A line needs two points. With none there is nothing to draw and the
          chart was drawn anyway — three empty rules and an axis, which reads as
          a chart that is broken rather than one that is waiting. With one there
          was a single dot pinned to the left edge, which is worse: it looks
          like a trend, and the trend it looks like is a cliff.

          So below two days the card says what it has, which is a number and
          how far off a line is. */}
      {series.length === 0 ? (
        <div className="card elev-sm stack gap-2">
          <div className="card-kicker">{t('progress.noScores')}</div>
          <div style={{ fontSize: 14, opacity: 0.8 }}>
            {t('progress.noScoresBody')}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => navigate('/library')}
          >
            <Icon name="mic" size={14} />
            {t('progress.findClip')}
          </button>
        </div>
      ) : series.length === 1 ? (
        <div className="card elev-sm row between gap-3">
          <div className="stack gap-1">
            <div className="card-kicker">{filter === 'All' ? t('progress.scoreToday') : t('progress.metricToday', t(`metric.${filter}`))}</div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              {t('progress.oneDay')}
            </div>
          </div>
          <div
            className="mono"
            style={{ fontSize: 40, lineHeight: 1, color: colorFor(series[0].value) }}
          >
            {series[0].value}
          </div>
        </div>
      ) : (
      <div className="card elev-sm">
        <svg width="100%" viewBox="0 0 640 180" style={{ display: 'block' }} aria-label={t('progress.chartLabel')}>
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
      )}

      <div className="stack gap-2">
        <div className="card-kicker">{t('progress.needPractice')}</div>
        {suggestions.length === 0 && (
          <div className="card-meta">{t('progress.needPracticeEmpty')}</div>
        )}
        {suggestions.map((item) => (
          <div className="card elev-sm row between gap-3" key={item.videoId}>
            <div>
              <div className="card-title" style={{ fontSize: 15 }}>
                {titleOf(item.videoId)}
              </div>
              <div className="card-meta">
                {item.detail.metric
                  ? t(
                      'score.bestSoFarWeakest',
                      item.detail.score,
                      t(`metric.${item.detail.metric}`),
                      item.detail.value ?? 0,
                    )
                  : t('score.bestSoFar', item.detail.score)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flexShrink: 0 }}
              onClick={() => goPractice(item.videoId)}
            >
              {t('progress.practiceNow')}
            </button>
          </div>
        ))}
      </div>

      {suggested && (
        <div>
          <div className="card-kicker" style={{ marginBottom: 'var(--space-2)' }}>
            {t('progress.nextUp')}
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
              <ClipFace
                id={suggested.id}
                posterUrl={suggested.posterUrl}
                line={suggested.captions[0]?.text ?? ''}
              />
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="card-title" style={{ fontSize: 15, display: 'block' }}>
                {suggested.title}
              </span>
              <span className="card-meta">{suggested.playlist || suggested.source}</span>
              <span style={{ fontSize: 13, opacity: 0.75, marginTop: 4, display: 'block' }}>
                {weakest
                  ? t('progress.workOn', t(`metric.${weakest}`))
                  : practised.has(suggested.id)
                    ? t('progress.anotherTake')
                    : t('progress.notPractised')}
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
