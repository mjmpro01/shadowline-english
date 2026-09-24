import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Mascot } from './Mascot'

/** How long the celebration stays: long enough to see, short enough never to
 *  be in the way of the next take. */
const SHOW_MS = 2600

/** Honey, moss, lake, berry, dusk and ember — the colours the clips wear. */
const COLOURS = ['#f7c948', '#8fd46b', '#6cc6f0', '#f59aa8', '#b69cf5', '#ffae73']

/**
 * A burst of confetti and the hero cheering, for a take that landed in gold.
 *
 * Drawn with CSS, not a library: sixty spans with a fall each, gone after a
 * few seconds. Anybody who has asked their device for less motion gets the hero
 * and the words without the confetti.
 */
export function Celebrate({ message, onDone }: { message: string; onDone: () => void }) {
  const [on, setOn] = useState(true)
  const pieces = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
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

  useEffect(() => {
    const timer = setTimeout(() => {
      setOn(false)
      onDone()
    }, SHOW_MS)
    return () => clearTimeout(timer)
  }, [onDone])

  if (!on) return null
  return (
    <div className="celebrate" role="status" aria-live="polite">
      <div className="celebrate-confetti" aria-hidden="true">
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
      <div className="celebrate-card">
        <Mascot mood="cheer" size={72} />
        <span>{message}</span>
      </div>
    </div>
  )
}
