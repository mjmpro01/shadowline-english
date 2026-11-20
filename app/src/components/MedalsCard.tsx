import { useI18n } from '../i18n'
import { useRemote } from '../lib/remote'
import { repository } from '../repository'

/** Profile → the weeks the learner finished in the top three. Absent until
 *  they have. */
export function MedalsCard() {
  const { t, locale } = useI18n()
  const remote = useRemote('', () => repository.medals())
  if (remote.state !== 'ready') return null
  const m = remote.value
  if (m.gold + m.silver + m.bronze === 0) return null
  const icon = ['🥇', '🥈', '🥉']
  return (
    <section
      className="card elev-sm stack gap-2"
      style={{ width: '100%', textAlign: 'left' }}
      aria-labelledby="medals-title"
    >
      <h2 id="medals-title" className="card-kicker" style={{ margin: 0 }}>
        {t('weekly.medalsTitle')}
      </h2>
      <div className="row gap-3 medals-counts">
        <span title={t('weekly.firsts')}>🥇 {m.gold}</span>
        <span title={t('weekly.seconds')}>🥈 {m.silver}</span>
        <span title={t('weekly.thirds')}>🥉 {m.bronze}</span>
      </div>
      <ul className="medals-recent">
        {m.recent.map((r) => (
          <li key={r.week}>
            {icon[r.place - 1]}{' '}
            {t('weekly.weekOf', new Date(`${r.week}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'numeric' }))}
          </li>
        ))}
      </ul>
    </section>
  )
}
