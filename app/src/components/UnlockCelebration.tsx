import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '../i18n'
import type { Animation } from '../lib/arenaArt'
import type { Character } from '../repository'
import { FighterSprite } from './FighterSprite'

const TIER_COLOUR: Record<Character['tier'], string> = {
  common: '#9aa0a6',
  rare: '#3f7fd0',
  epic: '#8f5bd6',
  legendary: '#e08a1e',
}

/**
 * A character just unlocked: rays in the colour of their tier, confetti, the
 * character playing their skill and then celebrating; play them at once, or
 * later.
 */
export function UnlockCelebration({
  character,
  onPlay,
  onClose,
}: {
  character: Character
  onPlay: () => void
  onClose: () => void
}) {
  const { t, locale } = useI18n()
  const lang = locale === 'vi' ? 'vi' : 'en'
  const [animation, setAnimation] = useState<Animation>('special')
  const play = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    play.current?.focus()
    const toWin = window.setTimeout(() => setAnimation('win'), 900)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(toWin)
      window.removeEventListener('keydown', onKey)
      before?.focus?.()
    }
  }, [onClose])
  const colour = TIER_COLOUR[character.tier]
  const pieces = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${(i % 12) * 60}ms`,
        duration: `${1600 + ((i * 53) % 900)}ms`,
        drift: `${((i * 29) % 80) - 40}px`,
        spin: `${((i * 97) % 720) - 360}deg`,
        colour: i % 3 === 0 ? '#fff4c2' : colour,
        round: i % 3 === 0,
      })),
    [colour],
  )
  const name = character.name[lang]
  return (
    <div
      className="unlock-backdrop"
      style={{ '--tier': colour } as CSSProperties}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="celebrate unlock-confetti" aria-hidden="true">
        <div className="celebrate-confetti">
          {pieces.map((p, i) => (
            <span
              key={i}
              className={p.round ? 'confetti round' : 'confetti'}
              style={
                {
                  left: p.left,
                  background: p.colour,
                  animationDelay: p.delay,
                  animationDuration: p.duration,
                  '--drift': p.drift,
                  '--spin': p.spin,
                } as CSSProperties
              }
            />
          ))}
        </div>
      </div>
      <div className="unlock-card" role="dialog" aria-modal="true" aria-label={t('arena.unlock.title', name)} data-tier={character.tier}>
        <div className="unlock-rays" aria-hidden="true" />
        <span className="card-kicker unlock-tier">{t(`arena.tier.${character.tier}`)}</span>
        <FighterSprite character={character} animation={animation} skill={character.skill.kind} size={200} label={name} />
        <h2 className="unlock-title">{t('arena.unlock.title', name)}</h2>
        <div className="card-meta">{t('arena.skill', character.skill.name[lang])}</div>
        <div className="row gap-2 wrap" style={{ justifyContent: 'center' }}>
          <button ref={play} type="button" className="btn btn-primary" onClick={onPlay}>
            {t('arena.unlock.play')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('arena.unlock.later')}
          </button>
        </div>
      </div>
    </div>
  )
}
