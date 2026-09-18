import { useNavigate } from 'react-router-dom'
import { ClipFace } from '../components/ClipFace'
import { Icon } from '../components/Icon'
import { statsFor } from '../lib/leaderboard'
import { colorFor } from '../lib/score'
import { clock } from '../lib/time'
import { useApp } from '../store/context'

export function DashboardScreen() {
  const { data, leaderboard } = useApp()
  const navigate = useNavigate()

  const mine = statsFor(data.takes)
  // Ranked by the server from everyone's scored takes. There is no filler: an
  // app with one learner shows one row.
  const rows = leaderboard.map((row, index) => ({ ...row, rank: index + 1 }))
  const podium = rows.slice(0, 3)
  const rest = rows.slice(3)
  const featured = data.videos.filter((video) => video.featured)

  /* The HUD. Four numbers a learner checks before deciding whether to practise,
     so each carries its own glyph: at a glance the row reads as a row of
     things rather than as four numbers that have to be labelled apart.

     `lit` is what separates a streak that is alive from one that is not. A
     zero on a flame tile in full colour would be a lie told in amber. */
  const summary = [
    { label: 'Clips practised', value: new Set(data.takes.map((take) => take.videoId)).size, icon: 'library' as const },
    { label: 'Takes recorded', value: mine.takes, icon: 'mic' as const },
    {
      label: 'Average score',
      value: mine.averageScore ?? '—',
      color: mine.averageScore ? colorFor(mine.averageScore) : undefined,
      icon: 'trophy' as const,
    },
    { label: 'Day streak', value: mine.streak, icon: 'flame' as const, lit: mine.streak > 0 },
  ]

  return (
    <div className="stack gap-8">
      <div>
        <h1 style={{ marginBottom: 2 }}>Dashboard</h1>
        <div className="card-meta">Clips worth practising, and how your scores are going</div>
      </div>

      <div className="grid-scores">
        {summary.map((stat) => (
          <div className="card elev-sm gap-1 stat-tile" data-lit={stat.lit ? '' : undefined} key={stat.label}>
            <div className="stat-tile-icon">
              <Icon name={stat.icon} size={16} />
            </div>
            <div className="mono stat-tile-value" style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className="card-kicker">{stat.label}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="row between wrap gap-2" style={{ marginBottom: 'var(--space-2)' }}>
          <div className="card-kicker" style={{ margin: 0 }}>
            Leaderboard
          </div>
          <span className="tag tag-neutral">{rows.length === 1 ? 'you are the only learner so far' : `${rows.length} learners`}</span>
        </div>

        <div className="podium">
          {podium.map((row) => (
            <div
              className="card elev-sm"
              key={row.userId}
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
              <div className="mono" style={{ fontSize: 26, color: colorFor(row.avg) }}>
                {Math.round(row.avg)}
              </div>
              <div className="card-meta mono">
                {row.takes} {row.takes === 1 ? 'take' : 'takes'} · {row.clips} clips
              </div>
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
                  <th>Takes</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((row) => (
                  <tr key={row.userId} style={{ background: row.isYou ? 'var(--color-accent-100)' : undefined }}>
                    <td className="mono">{row.rank}</td>
                    <td style={{ fontWeight: row.isYou ? 700 : 400 }}>
                      {row.name}
                      {row.isYou && ' (You)'}
                    </td>
                    <td className="mono" style={{ color: colorFor(row.avg) }}>{Math.round(row.avg)}</td>
                    <td className="mono">{row.takes}</td>
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
        {rows.length === 0 && (
          <div className="card-meta" style={{ marginBottom: 'var(--space-3)' }}>
            Nobody has a scored take yet — record one and you are on the board.
          </div>
        )}

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
                  <ClipFace
                    id={video.id}
                    posterUrl={video.posterUrl}
                    line={video.captions[0]?.text ?? ''}
                  />
                  <span className="tag tag-accent" style={{ position: 'absolute', left: 8, top: 8 }}>
                    featured
                  </span>
                  <span className="tag tag-neutral thumb-tag">{clock(video.durationSeconds)}</span>
                </button>
                <div className="card-title clamp-2" style={{ fontSize: 15, marginTop: 'var(--space-2)' }}>
                  {video.title}
                </div>
                {/* The line, for the same reason the library card shows it:
                    an unnamed clip is called "Clip 3", which says where it is
                    and nothing about what is said in it. */}
                <div className="card-meta clamp-2">
                  {video.captions[0]?.text || video.playlist || video.source}
                </div>
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
