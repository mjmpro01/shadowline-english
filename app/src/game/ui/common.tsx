import { useEffect, useState, type ReactNode } from 'react'
import type { Locale, Translate } from '../../i18n'
import type { GameState, Reward } from '../api'
import { art } from '../assets'
import { pick } from './util'


/** A 16px icon from items/, drawn at twice its size with square pixels. */
export function ItemIcon({ id, size = 32 }: { id: string; size?: number }) {
  const [missing, setMissing] = useState(false)
  if (missing) {
    // A picture not drawn yet: an empty space its size.
    return <span className="arena-icon arena-icon-standin" style={{ width: size, height: size }} aria-hidden="true" />
  }
  return (
    <img
      className="arena-icon"
      src={art(`items/${id}.png`)}
      width={size}
      height={size}
      alt=""
      onError={() => setMissing(true)}
    />
  )
}

/** One of a character's four faces: neutral, happy, thinking, worried. */
export function Portrait({ id, mood = 0 }: { id: string; mood?: number }) {
  if (id in STAND_IN_FACES) {
    // Not drawn yet: their initial, in their colour.
    const [letter, colour] = STAND_IN_FACES[id]
    return (
      <div className="arena-portrait arena-portrait-initial" style={{ background: colour }} aria-hidden="true">
        {letter}
      </div>
    )
  }
  if (id === 'grandma') {
    return (
      <div className="arena-portrait arena-portrait-letter">
        <ItemIcon id="letter" size={64} />
      </div>
    )
  }
  return (
    <div
      className="arena-portrait"
      style={{
        backgroundImage: `url(${art(`portraits/${id}.png`)})`,
        backgroundPosition: `${(mood * 100) / 3}% 0`,
      }}
      aria-hidden="true"
    />
  )
}

/** The people of Echo Town have no portraits yet. */
const STAND_IN_FACES: Record<string, [string, string]> = {
  elsa: ['E', '#6a4c93'],
  orin: ['O', '#2f5d8a'],
  lina: ['L', '#4f8a6a'],
  hugo: ['H', '#7a4a2a'],
  vy: ['V', '#5b8fb9'],
}

/** A panel over the farm, framed in the game's own wood. */
export function Sheet({
  title,
  onClose,
  children,
  t,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  t: Translate
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="arena-sheet-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className={`arena-sheet${wide ? ' arena-sheet-wide' : ''}`} role="dialog" aria-label={title}>
        <header className="arena-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="arena-x" onClick={onClose} aria-label={t('arena.close')}>
            ×
          </button>
        </header>
        <div className="arena-sheet-body">{children}</div>
      </section>
    </div>
  )
}

/** A reward, as chips: gold, stamina, items. */
export function RewardChips({ reward, state, locale, t }: { reward: Reward; state: GameState | null; locale: Locale; t: Translate }) {
  const name = (id: string) => {
    const item = state?.shop.find((s) => s.id === id)
    return item ? pick(item.name, locale) : id
  }
  return (
    <span className="arena-chips">
      {reward.gold ? (
        <span className="arena-chip">
          <ItemIcon id="coin" size={20} />
          {t('arena.goldN', reward.gold)}
        </span>
      ) : null}
      {reward.stamina ? (
        <span className="arena-chip">
          <ItemIcon id="stamina" size={20} />
          {t('arena.staminaN', reward.stamina)}
        </span>
      ) : null}
      {Object.entries(reward.items ?? {}).map(([id, qty]) => (
        <span className="arena-chip" key={id}>
          <ItemIcon id={id} size={20} />
          {qty} × {name(id)}
        </span>
      ))}
    </span>
  )
}
