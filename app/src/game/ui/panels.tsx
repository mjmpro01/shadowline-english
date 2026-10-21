import { Link } from 'react-router-dom'
import type { Locale, Translate } from '../../i18n'
import { canSpeak, speak } from '../../lib/speak'
import type { GameState, HarvestedWord } from '../api'
import { clock, secondsUntil } from '../growth'
import { ItemIcon, Sheet } from './common'
import { pick, useNow } from './util'

/** The story step where Bram asks for his hammer (server: game.TrollStep). */
const HAMMER_HINT_STEP = 15

/**
 * The panels the farm opens over itself. Each only shows the farm as the
 * server sent it and says which move the player chose; the screen around them
 * makes the move and puts the answer back.
 */

interface Base {
  state: GameState
  locale: Locale
  t: Translate
  onClose: () => void
  busy: boolean
  /** The server's clock minus this browser's: countdowns run on the server's. */
  skew: number
}

export function PlotPanel({
  idx,
  state,
  locale,
  t,
  onClose,
  busy,
  skew,
  onPlant,
  onHarvest,
}: Base & { idx: number; onPlant: (seed: string) => void; onHarvest: () => void }) {
  const now = useNow() + skew
  const plot = state.plots[idx]
  const crop = plot?.crop ? state.crops.find((c) => c.id === plot.crop) : undefined
  const seeds = state.shop.filter((s) => s.kind === 'seed' && (state.inventory[s.id] ?? 0) > 0)
  const left = secondsUntil(plot?.ripeAt ?? null, now)
  const total = crop ? crop.growSeconds * (1 - 0.2 * (plot?.level ?? 0)) : 1

  return (
    <Sheet title={t('arena.plot.title', idx + 1)} onClose={onClose} t={t}>
      {plot && plot.level > 0 && <p className="arena-muted">{t('arena.plot.level', plot.level)}</p>}
      {!plot?.unlocked ? (
        <p>{t('arena.plot.locked')}</p>
      ) : crop ? (
        <div className="stack gap-3">
          {left > 0 ? (
            <>
              <p>{t('arena.plot.growing', pick(crop.name, locale))}</p>
              <div className="arena-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, (1 - left / total) * 100)}%` }} />
              </div>
              <p className="arena-muted">{t('arena.plot.timeLeft', clock(left))}</p>
            </>
          ) : (
            <>
              <p>{t('arena.plot.ready', pick(crop.name, locale))}</p>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={onHarvest}>
                {t('arena.plot.harvest')}
              </button>
            </>
          )}
        </div>
      ) : seeds.length === 0 ? (
        <p>{t('arena.plot.noSeeds')}</p>
      ) : (
        <div className="stack gap-2">
          <p className="arena-muted">{t('arena.plot.empty')}</p>
          {seeds.map((seed) => (
            <button
              key={seed.id}
              type="button"
              className="btn btn-secondary arena-row-btn"
              disabled={busy}
              onClick={() => onPlant(seed.id)}
            >
              <ItemIcon id={seed.id} />
              {t('arena.plot.plant', pick(seed.name, locale), state.inventory[seed.id] ?? 0)}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}

export function ShopPanel({
  state,
  locale,
  t,
  onClose,
  busy,
  onBuy,
}: Base & { onBuy: (item: string) => void }) {
  return (
    <Sheet title={t('arena.shop.title')} onClose={onClose} t={t}>
      <ul className="arena-list">
        {state.shop.filter((item) => item.kind !== 'tool').map((item) => {
          const crop = state.crops.find((c) => c.seed === item.id)
          return (
            <li key={item.id} className="arena-list-row" data-locked={!item.unlocked}>
              <ItemIcon id={item.id} />
              <div className="arena-list-text">
                <strong>{pick(item.name, locale)}</strong>
                <span className="arena-muted">
                  {crop
                    ? t('arena.shop.grows', Math.round(crop.growSeconds / 60), crop.gold)
                    : item.hp
                      ? t('arena.shop.heals', item.hp)
                      : t('arena.shop.restores', item.stamina ?? 0)}
                </span>
                <span className="arena-muted">{t('arena.shop.owned', state.inventory[item.id] ?? 0)}</span>
              </div>
              {item.unlocked ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || state.profile.gold < item.price}
                  onClick={() => onBuy(item.id)}
                >
                  {t('arena.shop.buy', item.price)}
                </button>
              ) : (
                <span className="arena-muted arena-later">{t('arena.shop.later')}</span>
              )}
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}

export function BramPanel({
  state,
  t,
  onClose,
  busy,
  onUnlock,
  onUpgrade,
}: Base & { onUnlock: (idx: number) => void; onUpgrade: (idx: number) => void }) {
  const nextLocked = state.plots.find((p) => !p.unlocked)
  const upgradable = state.plots.filter((p) => p.unlocked && p.level < state.upgradeCosts.length)
  const hammer = (state.inventory.bram_hammer ?? 0) > 0
  return (
    <Sheet title={t('arena.bram.title')} onClose={onClose} t={t}>
      <div className="stack gap-3">
        {nextLocked ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || state.profile.gold < state.unlockCost}
            onClick={() => onUnlock(nextLocked.idx)}
          >
            {t('arena.bram.clear', state.unlockCost)}
          </button>
        ) : (
          <p>{t('arena.bram.allClear')}</p>
        )}
        <p className="arena-muted">{t('arena.bram.upgrade')}</p>
        {/* Once the story has sent the player after it, what the hammer would do. */}
        {hammer ? (
          <p className="arena-bram-hammer">
            <ItemIcon id="bram_hammer" size={24} /> {t('arena.bram.hammerBack')}
          </p>
        ) : (
          state.profile.mainStep >= HAMMER_HINT_STEP && <p className="arena-muted">{t('arena.bram.hammerLost')}</p>
        )}
        {upgradable.length === 0 ? (
          <p>{t('arena.bram.maxed')}</p>
        ) : (
          <div className="arena-grid-btns">
            {upgradable.map((p) => {
              const cost = state.upgradeCosts[p.level]
              return (
                <button
                  key={p.idx}
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy || state.profile.gold < cost}
                  onClick={() => onUpgrade(p.idx)}
                >
                  {t('arena.bram.upgradePlot', p.idx + 1, p.level, cost)}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Sheet>
  )
}

export function HousePanel({ state, t, onClose, busy, skew, onSleep }: Base & { onSleep: () => void }) {
  const left = secondsUntil(state.profile.canSleepAt, useNow() + skew)
  return (
    <Sheet title={t('arena.house.title')} onClose={onClose} t={t}>
      {left > 0 ? (
        <p>{t('arena.house.rested', clock(left))}</p>
      ) : (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onSleep}>
          {t('arena.house.sleep')}
        </button>
      )}
    </Sheet>
  )
}

export function BagPanel({ state, locale, t, onClose, busy, onUse }: Base & { onUse: (item: string) => void }) {
  const items = Object.entries(state.inventory).filter(([, qty]) => qty > 0)
  return (
    <Sheet title={t('arena.bag.title')} onClose={onClose} t={t}>
      {items.length === 0 ? (
        <p>{t('arena.bag.empty')}</p>
      ) : (
        <ul className="arena-list">
          {items.map(([id, qty]) => {
            const item = state.shop.find((s) => s.id === id)
            return (
              <li key={id} className="arena-list-row">
                <ItemIcon id={id} />
                <div className="arena-list-text">
                  <strong>{item ? pick(item.name, locale) : id}</strong>
                  <span className="arena-muted">× {qty}</span>
                </div>
                {item?.kind === 'food' && (
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => onUse(id)}>
                    {t('arena.bag.use')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}

/** The word a crop grew, with how it sounds and what it means. */
export function WordCard({
  word,
  gold,
  t,
  onClose,
  onListen,
}: {
  word: HarvestedWord | null
  gold: number
  t: Translate
  onClose: () => void
  onListen: (word: string) => void
}) {
  return (
    <Sheet title={t('arena.word.title')} onClose={onClose} t={t}>
      <div className="arena-word stack gap-3">
        <span className="arena-chip">
          <ItemIcon id="coin" size={20} />+{gold}
        </span>
        {word ? (
          <>
            <div className="arena-word-head">
              <ItemIcon id="word_scroll" size={48} />
              <div>
                <div className="arena-word-text">{word.word}</div>
                <div className="arena-word-ipa">{word.ipa}</div>
              </div>
            </div>
            <p className="arena-word-meaning">{word.meaning}</p>
            {canSpeak() && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  speak(word.word)
                  onListen(word.word)
                }}
              >
                🔊 {t('arena.listen')}
              </button>
            )}
            <p className="arena-muted">
              {t('arena.word.added')} <Link to="/vocabulary">{t('arena.word.open')}</Link>
            </p>
          </>
        ) : (
          <p>{t('arena.word.none')}</p>
        )}
      </div>
    </Sheet>
  )
}
