import { useEffect, useState } from 'react'
import { type Tier, tierOf } from '../lib/score'

/** How long the number takes to climb. Long enough to be a moment, short
 *  enough that nobody is waiting to read their score. */
const COUNT_MS = 650

const TIER_LABEL: Record<Tier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
}

/**
 * Counts from zero to the score once, when the score arrives.
 *
 * A number that appears is information; a number that climbs is a result. This
 * is the one moment in the app that is worth animating — a learner recorded
 * something and is waiting to find out how it went — so it is the one place
 * that does.
 *
 * Anybody whose system asks for less motion gets the number straight away.
 */
function stillPreferred(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function useCountUp(target: number): number {
  // Starts at the answer when there is nothing to animate, and at zero when
  // there is. Deciding here rather than in the effect is what keeps the still
  // version from painting the final number and then jumping back to zero.
  //
  // The badge is mounted fresh for each score — see the `key` where it is used
  // — so this initial value is read once per result, which is what makes it
  // safe to decide it here.
  const [shown, setShown] = useState(() => (stillPreferred() || target <= 0 ? target : 0))

  useEffect(() => {
    if (stillPreferred() || target <= 0) return

    let frame = 0
    const started = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / COUNT_MS)
      // Eased out, so it sprints and then settles rather than crawling to the
      // end at a constant speed.
      setShown(Math.round(target * (1 - (1 - progress) ** 3)))
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target])

  return shown
}

export function ScoreBadge({ score }: { score: number }) {
  const shown = useCountUp(score)
  const tier = tierOf(score)

  return (
    <div className={`score-badge tier-${tier}`} data-tier={tier}>
      <div className="score-badge-number">{shown}</div>
      <div className="score-badge-tier">{TIER_LABEL[tier]}</div>
    </div>
  )
}
