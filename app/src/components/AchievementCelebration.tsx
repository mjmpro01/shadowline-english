import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useT } from '../i18n'
import { achievementIcon } from '../lib/achievements'
import { useRemote } from '../lib/remote'
import { repository } from '../repository'
import { useApp } from '../store/context'

/** Long enough to read, short enough never to be in the way. */
const SHOW_MS = 7000

const COLOURS = ['#f7c948', '#8fd46b', '#6cc6f0', '#f59aa8', '#b69cf5', '#ffae73']

/**
 * An achievement just unlocked, celebrated once, wherever the learner is.
 *
 * Asked for again whenever a take is recorded and on every change of screen:
 * the server unlocks a milestone the moment the learning that reached it is
 * recorded, so the next screen is where it shows. One at a time, each marked
 * seen as it appears so a reload never shows it twice. In the corner rather
 * than across the screen, so it never covers the take's own celebration.
 */
export function AchievementCelebration() {
  const t = useT()
  const { data } = useApp()
  const { pathname } = useLocation()
  const remote = useRemote(`${data.takes.length}|${pathname}`, () => repository.newAchievements())
  // Shown already, this session: a request sent before one was marked seen
  // can still bring it back.
  const [shown, setShown] = useState<string[]>([])
  const queue = remote.state === 'ready' ? remote.value.filter((a) => !shown.includes(a.id)) : []
  const current = queue[0]
  const currentId = current?.id

  useEffect(() => {
    if (!currentId) return
    repository.markAchievementsSeen([currentId]).catch(() => {
      // Celebrated again next time, which is the better way to be wrong.
    })
    const timer = setTimeout(() => setShown((ids) => [...ids, currentId]), SHOW_MS)
    return () => clearTimeout(timer)
  }, [currentId])

  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${(i % 12) * 60}ms`,
        duration: `${1600 + ((i * 53) % 900)}ms`,
        drift: `${((i * 29) % 80) - 40}px`,
        spin: `${((i * 97) % 720) - 360}deg`,
        colour: COLOURS[i % COLOURS.length],
        round: i % 3 === 0,
      })),
    [],
  )

  if (!current) return null
  const dismiss = () => setShown((ids) => [...ids, current.id])
  return (
    <>
      <div className="celebrate" aria-hidden="true" key={`confetti-${current.id}`}>
        <div className="celebrate-confetti">
          {pieces.map((piece, i) => (
            <span
              key={i}
              className={piece.round ? 'confetti round' : 'confetti'}
              style={
                {
                  left: piece.left,
                  background: piece.colour,
                  animationDelay: piece.delay,
                  animationDuration: piece.duration,
                  '--drift': piece.drift,
                  '--spin': piece.spin,
                } as CSSProperties
              }
            />
          ))}
        </div>
      </div>
      <div className="ach-toast" role="status" aria-live="polite" key={current.id}>
        <span className="ach-toast-icon" aria-hidden="true">
          {achievementIcon(current.track)}
        </span>
        <div className="ach-toast-text">
          <span className="card-kicker">{t('ach.new')}</span>
          <strong>{t('ach.tier', current.track, current.target)}</strong>
          <span className="row gap-2 wrap ach-toast-meta">
            {current.gold > 0 && <span className="tag tag-neutral">{t('ach.gold', current.gold)}</span>}
            <Link to="/achievements" onClick={dismiss}>
              {t('ach.seeAll')}
            </Link>
          </span>
        </div>
        <button type="button" className="btn btn-ghost btn-icon ach-toast-close" onClick={dismiss} aria-label={t('ach.close')}>
          ×
        </button>
      </div>
    </>
  )
}
