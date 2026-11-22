import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FighterSprite } from '../components/FighterSprite'
import { useI18n } from '../i18n'
import { explain } from '../lib/errors'
import { useRemote } from '../lib/remote'
import {
  GEAR_SLOTS,
  repository,
  type ArenaState,
  type Fighter,
  type FighterLook,
  type GearItem,
  type GearSlot,
  type GearStats,
} from '../repository'
import '../styles/arena.css'

type Tab = 'fighter' | 'shop' | 'bag'

/**
 * The Arena: a fighter who starts as a beggar, coins earned by practising,
 * and a shop to spend them in. Duels come next.
 */
export function ArenaScreen() {
  const { t } = useI18n()
  const remote = useRemote('', () => repository.arena())
  // What the server answered last, once anything has been done here.
  const [state, setState] = useState<ArenaState | null>(null)
  const [tab, setTab] = useState<Tab>('fighter')
  const [editing, setEditing] = useState(false)
  const current = state ?? (remote.state === 'ready' ? remote.value : null)

  if (remote.state === 'error' && !state) {
    return <div className="card-meta">{t('arena.loadFailed')}</div>
  }
  if (!current) return <div className="card-meta" aria-busy="true" />

  if (!current.fighter || editing) {
    return (
      <CharacterCreator
        existing={current.fighter}
        equipped={current.equipped}
        onDone={(next) => {
          setState(next)
          setEditing(false)
        }}
        onCancel={current.fighter ? () => setEditing(false) : undefined}
      />
    )
  }
  const fighter = current.fighter

  return (
    <div className="stack gap-6 arena" data-testid="arena">
      <div className="row between wrap gap-3">
        <div>
          <h1 style={{ marginBottom: 2 }}>{t('arena.title')}</h1>
          <div className="card-meta">{t('arena.subtitle')}</div>
        </div>
        <Purse coins={current.coins} />
      </div>

      <section className="card elev-sm arena-stage">
        <FighterSprite
          body={fighter.body}
          skin={fighter.skin}
          hair={fighter.hair}
          equipped={current.equipped}
          label={fighter.name}
        />
        <div className="stack gap-2" style={{ minWidth: 0 }}>
          <div className="row gap-2 wrap" style={{ alignItems: 'baseline' }}>
            <h2 className="arena-name">{fighter.name}</h2>
            <span className="tag tag-neutral">{t('arena.level', fighter.level)}</span>
          </div>
          <StatList stats={current.stats} />
          <div>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
              {t('arena.editLook')}
            </button>
          </div>
        </div>
      </section>

      <div className="board-tabs" role="tablist" aria-label={t('arena.title')}>
        {(['fighter', 'shop', 'bag'] as const).map((one) => (
          <button
            key={one}
            type="button"
            role="tab"
            aria-selected={tab === one}
            className="board-tab"
            onClick={() => setTab(one)}
          >
            {t(`arena.tab.${one}`)}
          </button>
        ))}
      </div>

      {tab === 'fighter' && <Equipped state={current} />}
      {tab === 'shop' && <Shop state={current} onChange={setState} />}
      {tab === 'bag' && <Bag state={current} onChange={setState} />}

      <PvPSection />
      <ArenaBoardSection />
      <TowerSection fighter={fighter} equipped={current.equipped} />
    </div>
  )
}

function Purse({ coins }: { coins: number }) {
  const { t } = useI18n()
  const wallet = useRemote(String(coins), () => repository.wallet())
  return (
    <div className="arena-purse" title={t('arena.coinsHow')}>
      <span aria-hidden="true">🪙</span>
      <strong data-testid="coins">{t('arena.coins', coins)}</strong>
      {wallet.state === 'ready' && wallet.value.today > 0 && (
        <span className="card-meta">{t('arena.coinsToday', wallet.value.today)}</span>
      )}
    </div>
  )
}

function StatList({ stats }: { stats: GearStats }) {
  const { t } = useI18n()
  const rows: [string, string][] = [
    [t('arena.stat.hp'), String(stats.hp)],
    [t('arena.stat.atk'), String(stats.atk)],
    [t('arena.stat.def'), String(stats.def)],
    [t('arena.stat.time'), t('arena.seconds', stats.time)],
    [t('arena.stat.rage'), `+${stats.rage}`],
  ]
  return (
    <dl className="arena-stats" aria-label={t('arena.stats')}>
      {rows.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd className="mono">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A piece of gear's stats, the ones it has. */
function Bonuses({ stats }: { stats: GearStats }) {
  const { t } = useI18n()
  const parts = [
    stats.atk && `${t('arena.stat.atk')} +${stats.atk}`,
    stats.def && `${t('arena.stat.def')} +${stats.def}`,
    stats.hp && `${t('arena.stat.hp')} +${stats.hp}`,
    stats.time && `${t('arena.stat.time')} +${t('arena.seconds', stats.time)}`,
    stats.rage && `${t('arena.stat.rage')} +${stats.rage}`,
  ].filter(Boolean)
  return <div className="card-meta">{parts.join(' · ')}</div>
}

function itemsById(state: ArenaState): Map<string, GearItem> {
  return new Map(state.shop.map((it) => [it.id, it]))
}

function Equipped({ state }: { state: ArenaState }) {
  const { t, locale } = useI18n()
  const items = itemsById(state)
  return (
    <ul className="arena-slots">
      {GEAR_SLOTS.map((slot) => {
        const id = state.equipped[slot]
        const item = id ? items.get(id) : undefined
        return (
          <li key={slot}>
            <span className="card-kicker">{t(`arena.slot.${slot}`)}</span>
            <span>{item ? item.name[locale === 'vi' ? 'vi' : 'en'] : id ? starterName(id, t) : t('arena.slot.empty')}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** The beggar's kit is not in the shop, so its names live here. */
function starterName(id: string, t: ReturnType<typeof useI18n>['t']): string {
  if (id === 'rags') return t('arena.starter.rags')
  if (id === 'bare_fists') return t('arena.starter.fists')
  if (id === 'bare_feet') return t('arena.starter.feet')
  return id
}

function useAct(onChange: (s: ArenaState) => void) {
  const { t } = useI18n()
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const act = async (key: string, run: () => Promise<ArenaState>, done?: string) => {
    setBusy(key)
    setNote(null)
    try {
      onChange(await run())
      if (done) setNote(done)
    } catch (err) {
      setNote(explain(err, t, t('error.server')))
    } finally {
      setBusy(null)
    }
  }
  return { busy, note, act }
}

function Shop({ state, onChange }: { state: ArenaState; onChange: (s: ArenaState) => void }) {
  const { t, locale } = useI18n()
  const { busy, note, act } = useAct(onChange)
  const lang = locale === 'vi' ? 'vi' : 'en'
  return (
    <div className="stack gap-3">
      <div className="card-meta">{t('arena.coinsHow')}</div>
      {note && (
        <div className="card-meta" role="status">
          {note}
        </div>
      )}
      {GEAR_SLOTS.map((slot) => {
        const items = state.shop.filter((it) => it.slot === slot)
        if (items.length === 0) return null
        return (
          <section key={slot} aria-label={t(`arena.slot.${slot}`)}>
            <h2 className="card-kicker">{t(`arena.slot.${slot}`)}</h2>
            <div className="arena-items">
              {items.map((it) => {
                const short = it.price - state.coins
                return (
                  <article key={it.id} className="card elev-sm arena-item" data-rarity={it.rarity} aria-label={it.name[lang]}>
                    <div className="row between gap-2">
                      <strong>{it.name[lang]}</strong>
                      <span className="tag tag-neutral arena-rarity">{t(`arena.rarity.${it.rarity}`)}</span>
                    </div>
                    <Bonuses stats={it.stats} />
                    {it.owned ? (
                      <span className="tag tag-neutral">{t('arena.owned')}</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={short > 0 || busy !== null}
                        title={short > 0 ? t('arena.short', short) : undefined}
                        onClick={() => void act(it.id, () => repository.buyGear(it.id), t('arena.bought', it.name[lang]))}
                      >
                        🪙 {t('arena.buy', it.price)}
                      </button>
                    )}
                    {!it.owned && short > 0 && <div className="card-meta">{t('arena.short', short)}</div>}
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Bag({ state, onChange }: { state: ArenaState; onChange: (s: ArenaState) => void }) {
  const { t, locale } = useI18n()
  const { busy, note, act } = useAct(onChange)
  const lang = locale === 'vi' ? 'vi' : 'en'
  const items = itemsById(state)
  const owned = state.owned.map((id) => items.get(id)).filter((it): it is GearItem & { owned: boolean } => !!it)
  return (
    <div className="stack gap-3">
      {note && (
        <div className="card-meta" role="status">
          {note}
        </div>
      )}
      {owned.length === 0 ? (
        <div className="card-meta">{t('arena.coinsHow')}</div>
      ) : (
        <div className="arena-items">
          {owned.map((it) => {
            const wearing = state.equipped[it.slot] === it.id
            return (
              <article key={it.id} className="card elev-sm arena-item" data-rarity={it.rarity} aria-label={it.name[lang]}>
                <div className="row between gap-2">
                  <strong>{it.name[lang]}</strong>
                  <span className="card-kicker">{t(`arena.slot.${it.slot}`)}</span>
                </div>
                <Bonuses stats={it.stats} />
                {wearing ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy !== null}
                    onClick={() => void act(it.id, () => repository.equip(null, it.slot as GearSlot))}
                  >
                    {t('arena.unequip')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy !== null}
                    onClick={() => void act(it.id, () => repository.equip(it.id))}
                  >
                    {t('arena.equip')}
                  </button>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CharacterCreator({
  existing,
  equipped,
  onDone,
  onCancel,
}: {
  existing: FighterLook | null
  equipped: ArenaState['equipped']
  onDone: (s: ArenaState) => void
  onCancel?: () => void
}) {
  const { t } = useI18n()
  // Only the look: the fighter's level and experience are not the creator's
  // to send, and the server refuses fields it does not take.
  const [look, setLook] = useState<FighterLook>(
    existing
      ? { name: existing.name, body: existing.body, skin: existing.skin, hair: existing.hair }
      : { name: '', body: 'a', skin: 1, hair: 0 },
  )
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  // A new fighter is shown in the beggar's kit they will start in.
  const wearing = existing ? equipped : { body: 'rags', hands: 'bare_fists', feet: 'bare_feet' }

  const submit = async () => {
    setBusy(true)
    setNote(null)
    try {
      onDone(existing ? await repository.updateFighter(look) : await repository.createFighter(look))
    } catch (err) {
      setNote(explain(err, t, t('error.server')))
    } finally {
      setBusy(false)
    }
  }

  const choice = (label: string, count: number, value: number, set: (n: number) => void, swatch?: string[]) => (
    <fieldset className="arena-choice">
      <legend>{label}</legend>
      {Array.from({ length: count }, (_, i) => (
        <label key={i} className="arena-swatch" style={swatch ? { background: swatch[i] } : undefined}>
          <input type="radio" name={label} checked={value === i} onChange={() => set(i)} />
          <span className={swatch ? 'sr-only' : undefined}>{t('arena.create.option', i + 1)}</span>
        </label>
      ))}
    </fieldset>
  )

  return (
    <div className="stack gap-6 arena" data-testid="arena-create">
      <div>
        <h1 style={{ marginBottom: 2 }}>{t('arena.create.title')}</h1>
        {!existing && <div className="card-meta">{t('arena.create.story')}</div>}
      </div>
      <section className="card elev-sm arena-stage">
        <FighterSprite body={look.body} skin={look.skin} hair={look.hair} equipped={wearing} label={look.name || t('arena.create.title')} />
        <form
          className="stack gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label className="stack gap-1">
            <span className="card-kicker">{t('arena.create.name')}</span>
            <input
              className="input"
              value={look.name}
              maxLength={20}
              onChange={(e) => setLook({ ...look, name: e.target.value })}
              required
            />
          </label>
          <fieldset className="arena-choice">
            <legend>{t('arena.create.body')}</legend>
            {(['a', 'b'] as const).map((b) => (
              <label key={b} className="arena-swatch arena-swatch-wide">
                <input type="radio" name="body" checked={look.body === b} onChange={() => setLook({ ...look, body: b })} />
                <span>{b === 'a' ? t('arena.create.bodyA') : t('arena.create.bodyB')}</span>
              </label>
            ))}
          </fieldset>
          {choice(t('arena.create.skin'), 4, look.skin, (n) => setLook({ ...look, skin: n }), ['#f3d2b3', '#dcae86', '#b07a50', '#7a4e2e'])}
          {choice(t('arena.create.hair'), 4, look.hair, (n) => setLook({ ...look, hair: n }))}
          {note && (
            <div className="card-meta" role="alert">
              {note}
            </div>
          )}
          <div className="row gap-2 wrap">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {existing ? t('arena.create.save') : t('arena.create.go')}
            </button>
            {onCancel && (
              <button type="button" className="btn btn-ghost" onClick={onCancel}>
                {t('arena.cancel')}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  )
}

/** The tower: energy, the fighter's level, and a floor at a time to fight. */
function TowerSection({ fighter, equipped }: { fighter: Fighter; equipped: ArenaState['equipped'] }) {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const lang = locale === 'vi' ? 'vi' : 'en'
  const remote = useRemote('', () => repository.tower())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  if (remote.state !== 'ready') return null
  const tower = remote.value
  const minutes = tower.nextEnergyIn

  const fight = async (floor: number) => {
    setBusy(true)
    setNote(null)
    try {
      await repository.startDuel(floor)
      navigate('/arena/duel')
    } catch (err) {
      setNote(explain(err, t, t('error.server')))
      setBusy(false)
    }
  }

  return (
    <section className="stack gap-3" aria-labelledby="tower-title">
      <div className="row between wrap gap-2">
        <div>
          <h2 id="tower-title" style={{ margin: 0 }}>
            {t('arena.tower.title')}
          </h2>
          <div className="card-meta">{t('arena.tower.intro')}</div>
        </div>
        <div className="arena-energy" title={t('arena.tower.energyHow')}>
          <span className="arena-pips" aria-hidden="true">
            {Array.from({ length: tower.energyMax }, (_, i) => (
              <span key={i} data-on={i < tower.energy} />
            ))}
          </span>
          <strong data-testid="energy">{t('arena.tower.energy', tower.energy, tower.energyMax)}</strong>
          {minutes > 0 && <span className="card-meta">{t('arena.tower.next', minutes)}</span>}
        </div>
      </div>
      <div className="card-meta">
        {t('arena.level', tower.level)} · {t('arena.xp', tower.xp, tower.xpNext)}
      </div>
      {tower.activeDuel && (
        <button type="button" className="btn btn-primary" onClick={() => navigate('/arena/duel')}>
          {t('arena.tower.continue')}
        </button>
      )}
      {tower.energy === 0 && !tower.activeDuel && <div className="card-meta">{t('arena.tower.noEnergy')}</div>}
      {note && (
        <div className="card-meta" role="alert">
          {note}
        </div>
      )}
      <ol className="arena-floors">
        {tower.floors.map((f) => {
          const look = f.mirror ? fighter : f.look
          return (
            <li
              key={f.floor}
              className="card elev-sm arena-floor"
              data-boss={f.boss || undefined}
              data-locked={f.locked || undefined}
              aria-label={`${t('arena.tower.floor', f.floor)}: ${f.name[lang]}`}
            >
              <FighterSprite
                body={look.body}
                skin={look.skin}
                hair={look.hair}
                equipped={f.mirror ? equipped : f.equipped}
                facing="left"
                size={72}
                sheet={f.mirror ? undefined : `opponent/${f.id}`}
                animation="idle"
              />
              <div className="stack gap-1" style={{ minWidth: 0 }}>
                <span className="card-kicker">
                  {t('arena.tower.floor', f.floor)}
                  {f.boss && ` · ${t('arena.tower.boss')}`}
                </span>
                <strong>{f.name[lang]}</strong>
                <span className="card-meta">
                  {f.locked ? t('arena.tower.locked') : t('arena.tower.reward', f.coins, f.xp)}
                </span>
              </div>
              <div className="arena-floor-act">
                {f.cleared && <span className="tag tag-neutral">✓ {t('arena.tower.cleared')}</span>}
                {!f.locked && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || (tower.energy === 0 && !tower.activeDuel)}
                    onClick={() => void fight(f.floor)}
                  >
                    {t('arena.tower.fight')}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Rivals to fight: the learners rated nearest, or sparring bots. */
function PvPSection() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [round, setRound] = useState(0)
  const rivals = useRemote(String(round), () => repository.rivals())
  const tower = useRemote('', () => repository.tower())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const fight = async (id: string) => {
    setBusy(true)
    setNote(null)
    try {
      await repository.startPvP(id)
      navigate('/arena/duel')
    } catch (err) {
      setNote(explain(err, t, t('error.server')))
      setBusy(false)
    }
  }

  return (
    <section className="stack gap-3" aria-labelledby="pvp-title">
      <div className="row between wrap gap-2">
        <div>
          <h2 id="pvp-title" style={{ margin: 0 }}>
            {t('arena.pvp.title')}
          </h2>
          <div className="card-meta">{t('arena.pvp.intro')}</div>
        </div>
        {tower.state === 'ready' && (
          <div className="arena-rating">
            <strong data-testid="rating">{t('arena.pvp.rating', tower.value.rating)}</strong>
            <span className="card-meta">{t('arena.pvp.record', tower.value.pvpWins, tower.value.pvpLosses)}</span>
          </div>
        )}
      </div>
      {note && (
        <div className="card-meta" role="alert">
          {note}
        </div>
      )}
      {rivals.state === 'ready' && rivals.value.length === 0 && <div className="card-meta">{t('arena.pvp.none')}</div>}
      {rivals.state === 'ready' && rivals.value.length > 0 && (
        <ul className="arena-rivals">
          {rivals.value.map((r) => (
            <li key={r.id} className="card elev-sm arena-rival" aria-label={r.name}>
              <FighterSprite
                body={r.look.body}
                skin={r.look.skin}
                hair={r.look.hair}
                equipped={r.equipped}
                facing="left"
                size={84}
              />
              <div className="stack gap-1" style={{ minWidth: 0 }}>
                <strong>{r.name}</strong>
                <span className="card-meta">
                  {t('arena.pvp.level', r.level)} · {t('arena.pvp.rating', r.rating)}
                </span>
                {r.bot && <span className="tag tag-neutral">{t('arena.pvp.bot')}</span>}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || (tower.state === 'ready' && tower.value.energy === 0 && !tower.value.activeDuel)}
                onClick={() => void fight(r.id)}
              >
                {t('arena.pvp.fight')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" className="btn btn-ghost" onClick={() => setRound((n) => n + 1)}>
          {t('arena.pvp.more')}
        </button>
      </div>
    </section>
  )
}

/** This week's Arena board: points from wins against shadows. */
function ArenaBoardSection() {
  const { t } = useI18n()
  const remote = useRemote('', () => repository.arenaBoard())
  if (remote.state !== 'ready') return null
  const board = remote.value
  const medal = ['🥇', '🥈', '🥉']
  return (
    <section className="stack gap-2" aria-labelledby="arena-board-title">
      <div className="row between wrap gap-2">
        <h2 id="arena-board-title" style={{ margin: 0 }}>
          {t('arena.board.title')}
        </h2>
        <span className="tag tag-neutral">{t('arena.board.endsIn', Math.max(1, board.daysLeft))}</span>
      </div>
      <div className="card-meta">{t('arena.board.intro', board.prizes[0], board.prizes[1], board.prizes[2])}</div>
      {board.lastWeek.length > 0 && (
        <div className="card-meta">
          {t('arena.board.lastWeek')}{' '}
          {board.lastWeek.map((p) => `${medal[p.place - 1]} ${p.name}`).join(' · ')}
        </div>
      )}
      {board.rows.length === 0 ? (
        <div className="card-meta">{t('arena.board.empty')}</div>
      ) : (
        <ol className="arena-board">
          {board.rows.map((row) => (
            <li key={row.userId} data-you={row.isYou || undefined}>
              <span className="mono arena-board-rank">{row.rank <= 3 ? medal[row.rank - 1] : row.rank}</span>
              <strong>{row.name}</strong>
              <span className="card-meta">{t('arena.board.wins', row.wins)}</span>
              <span className="mono">{t('arena.board.points', row.points)}</span>
            </li>
          ))}
        </ol>
      )}
      {board.you && <div className="card-meta">{t('arena.board.you', board.you.rank, board.you.points)}</div>}
    </section>
  )
}
