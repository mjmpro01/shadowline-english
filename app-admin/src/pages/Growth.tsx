import { useEffect, useState, type CSSProperties } from 'react'
import { useI18n } from '../i18n'
import { Loading } from '../components/LoadState'
import { SegmentedControl } from '../components/SegmentedControl'
import { ApiError } from '../lib/api'
import { repository, type Growth as GrowthData, type GrowthDay, type Share } from '../repository'

const PERIODS = [14, 30, 90] as const
type Period = `${(typeof PERIODS)[number]}`

/**
 * Who comes back. Daily, weekly and monthly actives; each day's openers,
 * learners and sign-ups; retention by the week learners joined; and how far
 * the newest ones got.
 *
 * "Active" is opening the app; "learning" is doing something that counts toward
 * the daily goal. Days are Vietnam's, as the learner's own are. Before this the
 * only way to know whether anything kept learners was the Users page's last
 * sign-in column, read row by row.
 */
export function Growth() {
  const { t, locale } = useI18n()
  const [period, setPeriod] = useState<Period>('30')
  const [growth, setGrowth] = useState<GrowthData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let wanted = true
    repository
      .growth(Number(period))
      .then((next) => {
        if (!wanted) return
        setGrowth(next)
        setError(null)
      })
      .catch((err: unknown) => {
        if (wanted) setError(err instanceof ApiError ? err.message : t('growth.failed'))
      })
    return () => {
      wanted = false
    }
  }, [period, t])

  const percent = (share: Share | null) =>
    share === null ? '—' : share.of === 0 ? '—' : `${Math.round((share.did / share.of) * 100)}%`
  const stickiness = growth && growth.mau > 0 ? `${Math.round((growth.dau / growth.mau) * 100)}%` : '—'

  return (
    <div className="stack gap-3">
      <div className="row between wrap gap-2">
        <div>
          <h1 style={{ marginBottom: 2 }}>{t('growth.title')}</h1>
          <div className="card-meta">{t('growth.subtitle')}</div>
        </div>
        <SegmentedControl<Period>
          name={t('growth.period')}
          value={period}
          options={PERIODS.map((n) => ({ value: `${n}` as Period, label: t('growth.days', n) }))}
          onChange={setPeriod}
        />
      </div>

      {error !== null && <div className="card-meta">{error}</div>}
      {growth === null && error === null && <Loading />}

      {growth !== null && (
        <>
          <div className="growth-tiles">
            <Tile label={t('growth.dau')} value={growth.dau} />
            <Tile label={t('growth.wau')} value={growth.wau} />
            <Tile label={t('growth.mau')} value={growth.mau} />
            <Tile label={t('growth.stickiness')} value={stickiness} hint={t('growth.stickinessHint')} />
            <Tile label={t('growth.accounts')} value={growth.learners} />
          </div>

          <section className="card elev-sm stack gap-2">
            <h2 className="card-title">{t('growth.byDay')}</h2>
            <DayChart days={growth.days} locale={locale} />
            <div className="row gap-3 wrap card-meta">
              <span className="growth-key" data-series="active">{t('growth.active')}</span>
              <span className="growth-key" data-series="learning">{t('growth.learning')}</span>
              <span className="growth-key" data-series="signups">{t('growth.signups')}</span>
              <span className="growth-key" data-series="published">{t('growth.published')}</span>
            </div>
          </section>

          <section className="card elev-sm stack gap-2">
            <h2 className="card-title">{t('growth.cohorts')}</h2>
            <div className="card-meta">{t('growth.cohortsHint')}</div>
            {growth.cohorts.length === 0 ? (
              <div className="card-meta">{t('growth.noCohorts')}</div>
            ) : (
              <div className="table-scroll">
                <table className="table" data-testid="cohorts">
                  <thead>
                    <tr>
                      <th>{t('growth.week')}</th>
                      <th className="num">{t('growth.joined')}</th>
                      <th className="num">D1</th>
                      <th className="num">D7</th>
                      <th className="num">D30</th>
                    </tr>
                  </thead>
                  <tbody>
                    {growth.cohorts.map((c) => (
                      <tr key={c.week}>
                        <td className="mono">{new Date(c.week).toLocaleDateString(locale, { timeZone: 'UTC' })}</td>
                        <td className="num">{c.joined}</td>
                        {[c.d1, c.d7, c.d30].map((share, i) => (
                          <td
                            key={i}
                            className="num growth-cell"
                            style={{ '--share': share && share.of ? share.did / share.of : 0 } as CSSProperties}
                            title={share ? t('growth.shareOf', share.did, share.of) : t('growth.tooSoon')}
                          >
                            {percent(share)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card elev-sm stack gap-2" aria-labelledby="growth-push">
            <h2 id="growth-push" className="card-title">
              {t('growth.push')}
            </h2>
            <div className="card-meta">{t('growth.pushSubscribers', growth.push.subscribers)}</div>
            {growth.push.kinds.length === 0 ? (
              <div className="card-meta">{t('growth.pushNone')}</div>
            ) : (
              <div className="table-scroll">
                <table className="table" data-testid="push-kinds">
                  <thead>
                    <tr>
                      <th>{t('growth.pushKind')}</th>
                      <th className="num">{t('growth.pushSent')}</th>
                      <th className="num">{t('growth.pushOpened')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {growth.push.kinds.map((k) => (
                      <tr key={k.kind}>
                        <td>{t(`growth.push.${k.kind}`)}</td>
                        <td className="num">{k.sent}</td>
                        <td className="num">
                          {k.opened}
                          {k.sent > 0 && ` · ${Math.round((k.opened / k.sent) * 100)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="card-meta">
              {t('growth.pushD7', percent(growth.push.on), percent(growth.push.off))}
            </div>
          </section>

          <section className="card elev-sm stack gap-2">
            <h2 className="card-title">{t('growth.funnel', growth.funnelDays)}</h2>
            <Funnel
              steps={[
                { label: t('growth.funnelJoined'), n: growth.funnel.joined },
                { label: t('growth.funnelTake'), n: growth.funnel.firstTake },
                { label: t('growth.funnelReturned'), n: growth.funnel.returned },
                { label: t('growth.funnelGoal3'), n: growth.funnel.goal3 },
              ]}
            />
          </section>
        </>
      )}
    </div>
  )
}

function Tile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="card elev-sm growth-tile" title={hint}>
      <div className="mono growth-tile-value">{value}</div>
      <div className="card-kicker">{label}</div>
    </div>
  )
}

/** Three lines over the days: drawn in SVG, the same width as the card. */
function DayChart({ days, locale }: { days: GrowthDay[]; locale: string }) {
  const width = 640
  const height = 180
  const pad = { top: 10, right: 8, bottom: 22, left: 28 }
  const top = Math.max(1, ...days.flatMap((d) => [d.active, d.learning, d.signups, d.published]))
  const x = (i: number) => pad.left + (days.length < 2 ? 0 : (i / (days.length - 1)) * (width - pad.left - pad.right))
  const y = (v: number) => pad.top + (1 - v / top) * (height - pad.top - pad.bottom)
  const line = (pick: (d: GrowthDay) => number) =>
    days.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(pick(d)).toFixed(1)}`).join(' ')
  const label = (day: string) => new Date(day).toLocaleDateString(locale, { timeZone: 'UTC', day: 'numeric', month: 'numeric' })
  const ticks = days.length > 1 ? [0, Math.floor((days.length - 1) / 2), days.length - 1] : [0]
  return (
    <svg className="growth-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={days.map((d) => `${d.day}: ${d.active}`).join(', ')}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad.left} x2={width - pad.right} y1={y(top * f)} y2={y(top * f)} className="growth-grid" />
          <text x={pad.left - 6} y={y(top * f) + 4} textAnchor="end" className="growth-axis">
            {Math.round(top * f)}
          </text>
        </g>
      ))}
      {ticks.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={height - 6}
          textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}
          className="growth-axis"
        >
          {label(days[i].day)}
        </text>
      ))}
      <path d={line((d) => d.published)} className="growth-line" data-series="published" />
      <path d={line((d) => d.signups)} className="growth-line" data-series="signups" />
      <path d={line((d) => d.learning)} className="growth-line" data-series="learning" />
      <path d={line((d) => d.active)} className="growth-line" data-series="active" />
    </svg>
  )
}

/** Each step as a bar, as a share of the first. */
function Funnel({ steps }: { steps: { label: string; n: number }[] }) {
  const first = Math.max(1, steps[0]?.n ?? 1)
  return (
    <ol className="growth-funnel">
      {steps.map((step) => (
        <li key={step.label}>
          <span className="growth-funnel-label">{step.label}</span>
          <span className="growth-funnel-bar" style={{ '--share': step.n / first } as CSSProperties} />
          <span className="mono growth-funnel-n">
            {step.n}
            {steps[0].n > 0 && ` · ${Math.round((step.n / first) * 100)}%`}
          </span>
        </li>
      ))}
    </ol>
  )
}
