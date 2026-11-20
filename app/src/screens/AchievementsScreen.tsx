import { useI18n } from '../i18n'
import { achievementIcon, nextTarget } from '../lib/achievements'
import { useRemote } from '../lib/remote'
import { repository } from '../repository'

/**
 * Every achievement track: how far up its ladder the learner is, the next
 * target, and each milestone unlocked or still to come.
 */
export function AchievementsScreen() {
  const { t, locale } = useI18n()
  const remote = useRemote('', () => repository.achievements())

  return (
    <div className="stack gap-6">
      <div>
        <h1 style={{ marginBottom: 2 }}>{t('ach.title')}</h1>
        <div className="card-meta">{t('ach.intro')}</div>
      </div>

      {remote.state === 'error' && <div className="card-meta">{remote.message}</div>}
      {remote.state === 'ready' && (
        <>
          <div className="ach-summary" aria-live="polite">
            <span className="tag tag-neutral">{t('ach.unlockedOf', remote.value.unlocked, remote.value.total)}</span>
          </div>
          <div className="ach-grid">
            {remote.value.tracks.map((track) => {
              const targets = track.tiers.map((tier) => tier.target)
              const next = nextTarget(track.count, targets)
              const below = [...targets].reverse().find((target) => target <= track.count) ?? 0
              const share = next == null ? 1 : (track.count - below) / (next - below)
              return (
                <section className="card elev-sm stack gap-2 ach-track" key={track.track} aria-labelledby={`ach-${track.track}`}>
                  <div className="row gap-2" style={{ alignItems: 'center' }}>
                    <span className="ach-track-icon" aria-hidden="true">
                      {achievementIcon(track.track)}
                    </span>
                    <h2 id={`ach-${track.track}`} className="card-title" style={{ margin: 0, fontSize: 17 }}>
                      {t('ach.track', track.track)}
                    </h2>
                    <span className="mono ach-track-count">
                      {next == null ? track.count : `${track.count} / ${next}`}
                    </span>
                  </div>
                  <div
                    className="ach-bar"
                    role="progressbar"
                    aria-label={t('ach.track', track.track)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(share * 100)}
                  >
                    <span style={{ width: `${Math.round(share * 100)}%` }} />
                  </div>
                  <div className="card-meta">{next == null ? t('ach.allDone') : t('ach.toNext', next - track.count)}</div>
                  <ul className="ach-tiers">
                    {track.tiers.map((tier) => (
                      <li key={tier.id} data-unlocked={tier.unlockedAt ? '' : undefined}>
                        <span className="ach-tier-name">{t('ach.tier', track.track, tier.target)}</span>
                        <span className="ach-tier-meta">
                          {tier.unlockedAt
                            ? t(
                                'ach.unlockedOn',
                                new Date(tier.unlockedAt).toLocaleDateString(locale, { day: 'numeric', month: 'numeric', year: 'numeric' }),
                              )
                            : t('ach.locked')}
                          {tier.gold > 0 && ` · ${t('ach.gold', tier.gold)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
