import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { explain } from '../lib/errors'
import { DAILY_GOALS, repository, type DailyGoal, type Today } from '../repository'
import { Icon } from './Icon'
import { ReminderPrompt } from './RemindersCard'

/**
 * The top of the dashboard: how today is going and what to do next.
 *
 * Points toward a goal the learner chose, a streak kept by the server on
 * Vietnam's day (the same day the Arena and dictation reviews count in), and a
 * short list where every line is somewhere to go. The dashboard used to show
 * four totals and leave the deciding to the learner; a learner who opens the
 * app for two minutes needs to be told what those two minutes are for.
 */
export function TodayCard({ today, onChange }: { today: Today; onChange: (next: Today) => void }) {
  const t = useT()
  const navigate = useNavigate()
  const left = Math.max(0, today.goal - today.points)

  const items: { key: string; icon: Parameters<typeof Icon>[0]['name']; label: string; hint: string; done?: boolean; go: () => void }[] = []
  if (today.nextClip) {
    const clip = today.nextClip
    items.push({
      key: 'clip',
      icon: 'mic',
      label: t('today.practise', clip.title),
      hint: t('today.points', 2),
      go: () => navigate(`/library/${clip.id}/practice`),
    })
  }
  if (today.vocabDue > 0) {
    items.push({
      key: 'vocab',
      icon: 'brain',
      label: t('today.vocab', today.vocabDue),
      hint: t('today.pointsEach', 1),
      go: () => navigate('/vocabulary/practice'),
    })
  }
  if (today.arena) {
    const arena = today.arena
    items.push({
      key: 'arena',
      icon: 'sprout',
      label: t('today.arena', arena.done, arena.total),
      hint: '',
      done: arena.done >= arena.total,
      go: () => navigate('/arena'),
    })
  }

  return (
    <section className="card elev-sm today-card" aria-labelledby="today-title" data-reached={today.reached ? '' : undefined}>
      <div className="today-head">
        <GoalRing points={today.points} goal={today.goal} />
        <div className="stack gap-1" style={{ minWidth: 0 }}>
          <h2 id="today-title" className="today-title">
            {t('today.title')}
          </h2>
          <p className="today-status" data-testid="today-status">
            {today.reached
              ? today.goalGold > 0
                ? t('today.reachedGold', today.goalGold)
                : t('today.reached')
              : t('today.left', left)}
          </p>
          <Streak streak={today.streak} />
        </div>
      </div>

      {!today.goalChosen && <GoalPicker current={today.goal} onChange={onChange} prompt />}

      {/* The day it went well is the day to offer tomorrow's reminder. */}
      {today.reached && !today.remindersOn && !today.reminderPromptDismissed && (
        <ReminderPrompt onDone={() => onChange({ ...today, reminderPromptDismissed: true })} />
      )}

      {items.length > 0 && (
        <ul className="today-list" aria-label={t('today.todo')}>
          {items.map((item) => (
            <li key={item.key}>
              <button type="button" className="today-item" data-done={item.done ? '' : undefined} onClick={item.go}>
                <span className="today-item-icon" aria-hidden="true">
                  <Icon name={item.done ? 'check-circle' : item.icon} size={16} />
                </span>
                <span className="today-item-label">{item.label}</span>
                {item.hint && <span className="today-item-hint mono">{item.hint}</span>}
                <Icon name="chevron-right" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Points against the goal, as a ring that fills. */
function GoalRing({ points, goal }: { points: number; goal: number }) {
  const t = useT()
  const r = 30
  const around = 2 * Math.PI * r
  const share = goal > 0 ? Math.min(1, points / goal) : 0
  return (
    <div
      className="today-ring"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={Math.min(points, goal)}
      aria-label={t('today.ringLabel', points, goal)}
    >
      <svg viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
        <circle cx="36" cy="36" r={r} className="today-ring-track" />
        <circle
          cx="36"
          cy="36"
          r={r}
          className="today-ring-fill"
          strokeDasharray={around}
          strokeDashoffset={around * (1 - share)}
          transform="rotate(-90 36 36)"
        />
      </svg>
      <span className="today-ring-text mono" aria-hidden="true">
        {points}
        <small>/{goal}</small>
      </span>
    </div>
  )
}

function Streak({ streak }: { streak: Today['streak'] }) {
  const t = useT()
  return (
    <div className="today-streak" data-lit={streak.today ? '' : undefined} data-testid="today-streak">
      <Icon name="flame" size={16} />
      <span>{t('today.streak', streak.count)}</span>
      {streak.freezes > 0 && (
        <span className="today-freezes" title={t('today.freezes', streak.freezes)}>
          {'❄'.repeat(streak.freezes)}
          <span className="visually-hidden">{t('today.freezes', streak.freezes)}</span>
        </span>
      )}
      {streak.atRisk && <span className="today-risk">{t('today.atRisk')}</span>}
    </div>
  )
}

/**
 * The daily goal, from three: on the Today card until one is chosen, and on
 * the Profile screen after.
 */
export function GoalPicker({
  current,
  onChange,
  prompt = false,
}: {
  current: number
  onChange: (next: Today) => void
  prompt?: boolean
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const names: Record<DailyGoal, string> = {
    10: t('today.goalLight'),
    20: t('today.goalSteady'),
    40: t('today.goalKeen'),
  }
  const choose = async (goal: DailyGoal) => {
    setBusy(true)
    setError(null)
    try {
      onChange(await repository.setGoal(goal))
    } catch (err) {
      setError(explain(err, t, t('today.goalFailed')))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack gap-1">
      {prompt && <span className="card-meta">{t('today.goalPrompt')}</span>}
      <div className="row gap-2 wrap" role="group" aria-label={t('today.goalLabel')}>
        {DAILY_GOALS.map((goal) => (
          <button
            type="button"
            key={goal}
            className={`btn ${!prompt && goal === current ? 'btn-primary' : 'btn-secondary'}`}
            aria-pressed={!prompt && goal === current}
            disabled={busy}
            onClick={() => void choose(goal)}
          >
            {names[goal]} · {t('today.pointsShort', goal)}
          </button>
        ))}
      </div>
      {error && <span className="card-meta">{error}</span>}
    </div>
  )
}
