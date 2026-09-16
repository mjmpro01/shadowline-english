import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { SAMPLE_LEARNERS } from '../data/seed'
import { buildLeaderboard, statsFor } from '../lib/leaderboard'
import { colorFor } from '../lib/score'
import { useApp } from '../store/context'

export function DashboardScreen() {
  const { data } = useApp()
  const navigate = useNavigate()

  const mine = statsFor(data.takes)
  const rows = buildLeaderboard(SAMPLE_LEARNERS, { name: data.profile.name, stats: mine })
  const podium = rows.slice(0, 3)
  const rest = rows.slice(3)
  const featured = data.videos.filter((video) => video.featured)

  const summary = [
    { label: 'Clips practised', value: new Set(data.takes.map((take) => take.videoId)).size },
    { label: 'Takes recorded', value: mine.takes },
    { label: 'Average score', value: mine.averageScore ?? '—', color: mine.averageScore ? colorFor(mine.averageScore) : undefined },
    { label: 'Day streak', value: mine.streak },
  ]

  return (
    <div className="stack gap-8">
      <div>
        <h1 style={{ marginBottom: 2 }}>Dashboard</h1>
        <div className="card-meta">Clips worth practising, and how your scores are going</div>
      </div>

      <div className="grid-scores">
        {summary.map((stat) => (
          <div className="card elev-sm gap-1 stat-tile" key={stat.label}>
            <div className="card-kicker">{stat.label}</div>
            <div className="mono" style={{ fontSize: 28, color: stat.color }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="row between wrap gap-2" style={{ marginBottom: 'var(--space-2)' }}>
          <div className="card-kicker" style={{ margin: 0 }}>
            Leaderboard
          </div>
          <span className="tag tag-neutral">other learners are sample data</span>
        </div>

        <div className="podium">
          {podium.map((row) => (
            <div
              className="card elev-sm"
              key={row.id}
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
                  color: 'var(--color-bg)',
                }}
              >
                <span className="mono">{row.rank}</span>
              </div>
              <div className="podium-avatar">{row.name.charAt(0) || '?'}</div>
              <div style={{ fontSize: 13, fontWeight: row.isYou ? 700 : 400 }}>
                {row.name}
                {row.isYou && ' (You)'}
              </div>
              <div
                className="mono"
                style={{ fontSize: 26, color: row.averageScore < 0 ? undefined : colorFor(row.averageScore) }}
              >
                {row.averageScore < 0 ? '—' : row.averageScore}
              </div>
              <div className="card-meta mono">{row.streak} day streak</div>
            </div>
          ))}
        </div>

        {rest.length > 0 && (
          <div className="card elev-sm" style={{ padding: 0, overflow: 'hidden', borderRadius: 0, marginTop: 'var(--space-3)' }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Learner</th>
                  <th>Avg score</th>
                  <th>Streak</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((row) => (
                  <tr key={row.id} style={{ background: row.isYou ? 'var(--color-accent-100)' : undefined }}>
                    <td className="mono">{row.rank}</td>
                    <td style={{ fontWeight: row.isYou ? 700 : 400 }}>
                      {row.name}
                      {row.isYou && ' (You)'}
                    </td>
                    <td className="mono" style={{ color: row.averageScore < 0 ? undefined : colorFor(row.averageScore) }}>
                      {row.averageScore < 0 ? '—' : row.averageScore}
                    </td>
                    <td className="mono">{row.streak}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="card-kicker" style={{ marginBottom: 'var(--space-2)' }}>
          Featured clips
        </div>
        {featured.length === 0 ? (
          <div className="card-meta">Nothing featured yet — an admin picks these in the clip studio.</div>
        ) : (
          <div className="grid-cards">
            {featured.map((video) => (
              <div className="card elev-sm" key={video.id} style={{ padding: 'var(--space-2)' }}>
                <button
                  type="button"
                  className="link-button thumb"
                  onClick={() => navigate(`/library/${video.id}`)}
                  aria-label={`Open ${video.title}`}
                >
                  <Icon name="play" size={28} />
                  <span className="tag tag-accent" style={{ position: 'absolute', left: 8, top: 8 }}>
                    featured
                  </span>
                  <span className="tag tag-neutral thumb-tag">{video.duration}</span>
                </button>
                <div className="card-title clamp-2" style={{ fontSize: 15, marginTop: 'var(--space-2)' }}>
                  {video.title}
                </div>
                <div className="card-meta">{video.playlist || video.source}</div>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  style={{ marginTop: 2 }}
                  onClick={() => navigate(`/library/${video.id}/practice`)}
                >
                  <Icon name="mic" size={14} />
                  Practice
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
