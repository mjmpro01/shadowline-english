import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { achievementIcon } from '../lib/achievements'
import { useRemote } from '../lib/remote'
import { repository, type AchievementTier } from '../repository'

/** Profile → how many milestones are unlocked, the latest few, and the way to
 *  all of them. Shown from the start, so a new learner sees what there is. */
export function AchievementsCard() {
  const t = useT()
  const remote = useRemote('', () => repository.achievements())
  if (remote.state !== 'ready') return null
  const board = remote.value
  const latest = board.tracks
    .flatMap((track) =>
      track.tiers
        .filter((tier): tier is AchievementTier & { unlockedAt: string } => tier.unlockedAt != null)
        .map((tier) => ({ ...tier, track: track.track })),
    )
    .sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt) || b.target - a.target)
    .slice(0, 3)
  return (
    <section className="card elev-sm stack gap-2" style={{ width: '100%', textAlign: 'left' }} aria-labelledby="ach-card-title">
      <div className="row between wrap gap-2">
        <h2 id="ach-card-title" className="card-kicker" style={{ margin: 0 }}>
          {t('ach.title')}
        </h2>
        <Link to="/achievements">{t('ach.seeAll')}</Link>
      </div>
      <div className="ach-card-count">{t('ach.unlockedOf', board.unlocked, board.total)}</div>
      {latest.length === 0 ? (
        <div className="card-meta">{t('ach.none')}</div>
      ) : (
        <ul className="ach-card-latest">
          {latest.map((a) => (
            <li key={a.id}>
              <span aria-hidden="true">{achievementIcon(a.track)}</span> {t('ach.tier', a.track, a.target)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
