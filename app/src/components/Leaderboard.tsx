import { useState } from 'react'
import { useT } from '../i18n'
import { colorFor } from '../lib/score'
import type { LeaderboardRow, WeeklyBoard, WeeklyMedals } from '../repository'

/**
 * The dashboard's leaderboard: this week by practice points, which anyone can
 * top by practising this week, and all time by average score. The week comes
 * first because it is the one a new learner can be on.
 */

interface Entry {
  key: string
  rank: number
  name: string
  isYou: boolean
  value: string
  valueColor?: string
  meta: string
  count: string
  medals?: WeeklyMedals
}

type Tab = 'week' | 'all'

export function LeaderboardSection({ allTime, weekly }: { allTime: LeaderboardRow[]; weekly: WeeklyBoard | null }) {
  const t = useT()
  const [tab, setTab] = useState<Tab>('week')

  const week: Entry[] = (weekly?.rows ?? []).map((row) => ({
    key: row.userId,
    rank: row.rank,
    name: row.name,
    isYou: row.isYou,
    value: String(row.points),
    meta: t('weekly.points', row.points),
    count: String(row.points),
    medals: row.medals,
  }))
  const all: Entry[] = allTime.map((row, index) => ({
    key: row.userId,
    rank: index + 1,
    name: row.name,
    isYou: row.isYou,
    value: String(Math.round(row.avg)),
    valueColor: colorFor(row.avg),
    meta: t('dash.takesAndClips', row.takes, row.clips),
    count: String(row.takes),
  }))

  // Only once somebody is on either. An empty board with "0 learners" beside
  // it told a new learner the app was deserted.
  if (week.length === 0 && all.length === 0 && !weekly?.lastWeek.length) return null

  const shown = tab === 'week' ? week : all
  const daysLeft = Math.max(1, weekly?.daysLeft ?? 1)
  const medal = ['🥇', '🥈', '🥉']

  return (
    <section aria-labelledby="board-title">
      <div className="row between wrap gap-2" style={{ marginBottom: 'var(--space-2)' }}>
        <h2 id="board-title" className="card-kicker" style={{ margin: 0 }}>
          {t('dash.leaderboard')}
        </h2>
        <div className="board-tabs" role="tablist" aria-label={t('dash.leaderboard')}>
          {(['week', 'all'] as const).map((one) => (
            <button
              type="button"
              key={one}
              role="tab"
              aria-selected={tab === one}
              className="board-tab"
              onClick={() => setTab(one)}
            >
              {one === 'week' ? t('weekly.tab') : t('weekly.allTab')}
            </button>
          ))}
        </div>
      </div>

      {tab === 'week' && weekly && (
        <div className="card-meta board-note">
          {t('weekly.endsIn', daysLeft)}
          {weekly.lastWeek.length > 0 && (
            <>
              {' · '}
              {t('weekly.lastWeek')}{' '}
              {weekly.lastWeek
                .map((p) => `${medal[p.place - 1]} ${p.name}${p.isYou ? ` (${t('dash.you')})` : ''}`)
                .join(' · ')}
            </>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="card-meta">{tab === 'week' ? t('weekly.empty') : t('dash.nobodyScored')}</div>
      ) : (
        <Board entries={shown} valueLabel={tab === 'week' ? t('weekly.pointsHeader') : t('dash.avgScore')} countLabel={tab === 'week' ? t('weekly.pointsHeader') : t('dash.takes')} />
      )}

      {tab === 'week' && weekly?.you && (
        <div className="card-meta board-you">{t('weekly.you', weekly.you.rank, weekly.you.points)}</div>
      )}
      {tab === 'all' && <span className="tag tag-neutral board-count">{t('dash.learners', all.length)}</span>}
    </section>
  )
}

function Medals({ medals }: { medals?: WeeklyMedals }) {
  if (!medals) return null
  const parts = [
    ['🥇', medals.gold],
    ['🥈', medals.silver],
    ['🥉', medals.bronze],
  ].filter(([, n]) => Number(n) > 0)
  if (parts.length === 0) return null
  return (
    <span className="board-medals">
      {parts.map(([icon, n]) => `${icon}${Number(n) > 1 ? `×${n}` : ''}`).join(' ')}
    </span>
  )
}

function Board({ entries, valueLabel, countLabel }: { entries: Entry[]; valueLabel: string; countLabel: string }) {
  const t = useT()
  const podium = entries.slice(0, 3)
  const rest = entries.slice(3)
  return (
    <>
      <div className="podium">
        {podium.map((row) => (
          <div
            className="card elev-sm"
            key={row.key}
            style={{
              alignItems: 'center',
              textAlign: 'center',
              gap: 6,
              background: row.isYou ? 'var(--color-accent-100)' : undefined,
            }}
          >
            <div
              className="podium-rank"
              style={{
                background: row.rank === 1 ? 'var(--color-accent)' : 'var(--color-accent-300)',
                color: 'var(--color-on-accent)',
              }}
            >
              <span className="mono">{row.rank}</span>
            </div>
            <div className="podium-avatar">{row.name.charAt(0) || '?'}</div>
            <div style={{ fontSize: 14, fontWeight: row.isYou ? 700 : 400 }}>
              {row.name}
              {row.isYou && ` (${t('dash.you')})`}
              <Medals medals={row.medals} />
            </div>
            <div className="mono" style={{ fontSize: 26, color: row.valueColor }}>
              {row.value}
            </div>
            <div className="card-meta mono">{row.meta}</div>
          </div>
        ))}
      </div>

      {rest.length > 0 && (
        <div
          className="card elev-sm"
          style={{ padding: 0, overflow: 'hidden', borderRadius: 0, marginTop: 'var(--space-3)' }}
        >
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>{t('dash.rank')}</th>
                <th>{t('dash.learner')}</th>
                <th>{valueLabel}</th>
                {countLabel !== valueLabel && <th>{countLabel}</th>}
              </tr>
            </thead>
            <tbody>
              {rest.map((row) => (
                <tr key={row.key} style={{ background: row.isYou ? 'var(--color-accent-100)' : undefined }}>
                  <td className="mono">{row.rank}</td>
                  <td style={{ fontWeight: row.isYou ? 700 : 400 }}>
                    {row.name}
                    {row.isYou && ` (${t('dash.you')})`}
                    <Medals medals={row.medals} />
                  </td>
                  <td className="mono" style={{ color: row.valueColor }}>
                    {row.value}
                  </td>
                  {countLabel !== valueLabel && <td className="mono">{row.count}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
