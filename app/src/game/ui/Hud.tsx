import { useRef, useState } from 'react'
import type { Locale, Translate } from '../../i18n'
import type { GameState, Quests } from '../api'
import { BASE } from '../assets'
import type { GameBus, Target } from '../bus'
import { clock, secondsUntil } from '../growth'
import { ItemIcon } from './common'
import { pick, useNow } from './util'

/** Gold, stamina, and the buttons for the quest book and the bag. */
export function Hud({
  state,
  quests,
  t,
  skew,
  onQuests,
  onBag,
}: {
  state: GameState
  quests: Quests | null
  t: Translate
  skew: number
  onQuests: () => void
  onBag: () => void
}) {
  const now = useNow() + skew
  const p = state.profile
  const next = secondsUntil(p.staminaNextAt, now)
  return (
    <div className="arena-hud">
      <div className="arena-stat" title={t('arena.gold')}>
        <ItemIcon id="coin" size={24} />
        <span className="arena-stat-value" data-testid="arena-gold">
          {p.gold}
        </span>
      </div>
      <div className="arena-stat" title={t('arena.stamina')}>
        <ItemIcon id="stamina" size={24} />
        <div className="arena-stamina">
          <div className="arena-bar arena-bar-stamina" aria-hidden="true">
            <span style={{ width: `${(p.stamina / p.staminaMax) * 100}%` }} />
          </div>
          <span className="arena-stat-small" data-testid="arena-stamina">
            {p.stamina}/{p.staminaMax}
            {next > 0 && ` · ${t('arena.staminaNext', clock(next))}`}
          </span>
        </div>
      </div>
      <button type="button" className="arena-hud-btn" onClick={onQuests} aria-label={t('arena.quests')}>
        <ItemIcon id="quest_book" size={28} />
        {quests && quests.claimable > 0 && <span className="arena-badge">{quests.claimable}</span>}
      </button>
      <button type="button" className="arena-hud-btn" onClick={onBag} aria-label={t('arena.bag')}>
        <ItemIcon id="seed_sprout" size={28} />
      </button>
    </div>
  )
}

/** The story step in progress, small, in a corner. */
export function Tracker({
  quests,
  locale,
  onOpen,
}: {
  quests: Quests | null
  locale: Locale
  onOpen: () => void
}) {
  const main = quests?.main
  if (!main) return null
  return (
    <button type="button" className="arena-tracker" onClick={onOpen} data-done={main.done}>
      <ItemIcon id="letter" size={20} />
      <span>
        {pick(main.objective, locale)}
        {main.target > 0 && ` · ${main.progress}/${main.target}`}
      </span>
    </button>
  )
}

const ACTION_LABEL = {
  plot: 'arena.act.plot',
  npc: 'arena.act.talk',
  house: 'arena.act.house',
  mailbox: 'arena.act.mailbox',
  board: 'arena.act.board',
} as const

/** The action button: what pressing E (or tapping it) would do right now. */
export function ActionButton({ focus, bus, t }: { focus: Target | null; bus: GameBus; t: Translate }) {
  if (!focus) return null
  return (
    <button
      type="button"
      className="arena-action"
      style={{ backgroundImage: `url(${BASE}ui/button_action.png)` }}
      onClick={() => bus.press()}
    >
      <span>{t(ACTION_LABEL[focus.kind])}</span>
      <kbd className="arena-kbd">E</kbd>
    </button>
  )
}

/** The on-screen joystick for touch screens: drag the knob, the player walks. */
export function Joystick({ bus }: { bus: GameBus }) {
  const base = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const radius = 44

  const move = (clientX: number, clientY: number) => {
    const rect = base.current?.getBoundingClientRect()
    if (!rect) return
    let dx = clientX - (rect.left + rect.width / 2)
    let dy = clientY - (rect.top + rect.height / 2)
    const len = Math.hypot(dx, dy)
    if (len > radius) {
      dx = (dx / len) * radius
      dy = (dy / len) * radius
    }
    setKnob({ x: dx, y: dy })
    bus.setJoy(dx / radius, dy / radius)
  }
  const release = () => {
    setKnob({ x: 0, y: 0 })
    bus.setJoy(0, 0)
  }

  return (
    <div
      ref={base}
      className="arena-joystick"
      style={{ backgroundImage: `url(${BASE}ui/joystick_base.png)` }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e.clientX, e.clientY)
      }}
      onPointerUp={release}
      onPointerCancel={release}
      aria-hidden="true"
    >
      <span
        className="arena-knob"
        style={{
          backgroundImage: `url(${BASE}ui/joystick_knob.png)`,
          transform: `translate(${knob.x}px, ${knob.y}px)`,
        }}
      />
    </div>
  )
}
