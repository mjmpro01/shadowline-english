import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FighterSprite } from '../components/FighterSprite'
import { useI18n } from '../i18n'
import { explain } from '../lib/errors'
import { useRemote } from '../lib/remote'
import { repository, type ArenaState, type Character, type Fighter, type FighterStats, type Tier } from '../repository'
import '../styles/arena.css'

const TIERS: Tier[] = ['common', 'rare', 'epic', 'legendary']

/**
 * The Arena: a fighter who starts as one of two free characters, coins earned
 * by practising, and 22 more characters to unlock with them, each with their
 * own weapon and skill; then the tower, shadows to fight, and the week's board.
 */
export function ArenaScreen() {
  const { t } = useI18n()
  const remote = useRemote('', () => repository.arena())
  // What the server answered last, once anything has been done here.
  const [state, setState] = useState<ArenaState | null>(null)
  const current = state ?? (remote.state === 'ready' ? remote.value : null)

  if (remote.state === 'error' && !state) {
    return <div className="card-meta">{t('arena.loadFailed')}</div>
  }
  if (!current) return <div className="card-meta" aria-busy="true" />
  if (!current.fighter) return <CharacterCreator state={current} onDone={setState} />
  const fighter = current.fighter
  const playing = characterOf(current, fighter.character)

  return (
    <div className="stack gap-6 arena" data-testid="arena">
      <div className="row between wrap gap-3">
        <div>
          <h1 style={{ marginBottom: 2 }}>{t('arena.title')}</h1>
          <div className="card-meta">{t('arena.subtitle')}</div>
        </div>
        <Purse coins={current.coins} />
      </div>

      <FighterCard state={current} fighter={fighter} playing={playing} onChange={setState} />
      <Roster state={current} onChange={setState} />

      <PvPSection />
      <ArenaBoardSection />
      <TowerSection playing={playing} />
    </div>
  )
}

/** The character a fighter plays, from the roster. */
function characterOf(state: ArenaState, id: string): Character {
  return state.roster.find((c) => c.id === id) ?? state.roster[0]
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

function StatList({ stats }: { stats: FighterStats }) {
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

/** What a character adds to a fighter's own stats, the ones it adds. */
function Bonuses({ stats }: { stats: FighterStats }) {
  const { t } = useI18n()
  const parts = [
    stats.atk && `${t('arena.stat.atk')} +${stats.atk}`,
    stats.def && `${t('arena.stat.def')} +${stats.def}`,
    stats.hp && `${t('arena.stat.hp')} +${stats.hp}`,
    stats.time && `${t('arena.stat.time')} +${t('arena.seconds', stats.time)}`,
    stats.rage && `${t('arena.stat.rage')} +${stats.rage}`,
  ].filter(Boolean)
  return parts.length ? <div className="card-meta">{parts.join(' · ')}</div> : null
}

/** A character's weapon and skill, as one says them. */
function SkillLine({ character }: { character: Character }) {
  const { t, locale } = useI18n()
  const lang = locale === 'vi' ? 'vi' : 'en'
  return (
    <div className="stack gap-1">
      <span className="card-meta">{t('arena.weapon', character.weapon.name[lang])}</span>
      <span className="arena-skill" data-skill={character.skill.kind}>
        <strong>{t('arena.skill', character.skill.name[lang])}</strong>{' '}
        <span className="card-meta">{t(`arena.skill.${character.skill.kind}`)}</span>
      </span>
    </div>
  )
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

/** The fighter as they stand: the character played, their stats and skill. */
function FighterCard({
  state,
  fighter,
  playing,
  onChange,
}: {
  state: ArenaState
  fighter: Fighter
  playing: Character
  onChange: (s: ArenaState) => void
}) {
  const { t, locale } = useI18n()
  const lang = locale === 'vi' ? 'vi' : 'en'
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(fighter.name)
  const { busy, note, act } = useAct((next) => {
    onChange(next)
    setRenaming(false)
  })
  return (
    <section className="card elev-sm arena-stage">
      <FighterSprite character={playing} label={fighter.name} />
      <div className="stack gap-2" style={{ minWidth: 0 }}>
        {renaming ? (
          <form
            className="row gap-2 wrap"
            onSubmit={(e) => {
              e.preventDefault()
              void act('rename', () => repository.renameFighter(name))
            }}
          >
            <input
              className="input"
              aria-label={t('arena.create.name')}
              value={name}
              maxLength={20}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary" disabled={busy !== null}>
              {t('arena.rename.save')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setRenaming(false)}>
              {t('arena.cancel')}
            </button>
          </form>
        ) : (
          <div className="row gap-2 wrap" style={{ alignItems: 'baseline' }}>
            <h2 className="arena-name">{fighter.name}</h2>
            <span className="tag tag-neutral">{t('arena.level', fighter.level)}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(true)}>
              {t('arena.rename')}
            </button>
          </div>
        )}
        <div className="row gap-2 wrap" style={{ alignItems: 'baseline' }}>
          <strong>{playing.name[lang]}</strong>
          <span className="tag tag-neutral arena-tier" data-tier={playing.tier}>
            {t(`arena.tier.${playing.tier}`)}
          </span>
        </div>
        <SkillLine character={playing} />
        <StatList stats={state.stats} />
        {note && (
          <div className="card-meta" role="alert">
            {note}
          </div>
        )}
      </div>
    </section>
  )
}

/** Every character, by tier: unlock one with coins, or play one owned. */
function Roster({ state, onChange }: { state: ArenaState; onChange: (s: ArenaState) => void }) {
  const { t, locale } = useI18n()
  const lang = locale === 'vi' ? 'vi' : 'en'
  const playing = state.fighter?.character
  const [tier, setTier] = useState<Tier>(() => characterOf(state, playing ?? '').tier)
  const { busy, note, act } = useAct(onChange)
  const owned = state.roster.filter((c) => c.owned).length
  return (
    <section className="stack gap-3" aria-labelledby="roster-title">
      <div className="row between wrap gap-2">
        <div>
          <h2 id="roster-title" style={{ margin: 0 }}>
            {t('arena.roster.title')}
          </h2>
          <div className="card-meta">{t('arena.roster.intro')}</div>
        </div>
        <span className="tag tag-neutral">{t('arena.roster.count', owned, state.roster.length)}</span>
      </div>
      <div className="board-tabs" role="tablist" aria-label={t('arena.roster.title')}>
        {TIERS.map((one) => (
          <button
            key={one}
            type="button"
            role="tab"
            aria-selected={tier === one}
            className="board-tab"
            onClick={() => setTier(one)}
          >
            {t(`arena.tier.${one}`)}
          </button>
        ))}
      </div>
      {note && (
        <div className="card-meta" role="status">
          {note}
        </div>
      )}
      <div className="arena-items" role="tabpanel">
        {state.roster
          .filter((c) => c.tier === tier)
          .map((c) => {
            const short = c.price - state.coins
            const name = c.name[lang]
            return (
              <article
                key={c.id}
                className="card elev-sm arena-item arena-character"
                data-rarity={c.tier}
                data-playing={c.id === playing || undefined}
                aria-label={name}
              >
                <FighterSprite character={c} size={96} label={name} />
                <div className="stack gap-1" style={{ minWidth: 0 }}>
                  <strong>{name}</strong>
                  <SkillLine character={c} />
                  <Bonuses stats={c.bonus} />
                  {c.id === playing ? (
                    <span className="tag tag-neutral">✓ {t('arena.playing')}</span>
                  ) : c.owned ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy !== null}
                      onClick={() => void act(c.id, () => repository.selectCharacter(c.id), t('arena.selected', name))}
                    >
                      {t('arena.select')}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={short > 0 || busy !== null}
                        onClick={() => void act(c.id, () => repository.buyCharacter(c.id), t('arena.bought', name))}
                      >
                        🪙 {t('arena.buy', c.price)}
                      </button>
                      {short > 0 && <div className="card-meta">{t('arena.short', short)}</div>}
                    </>
                  )}
                </div>
              </article>
            )
          })}
      </div>
    </section>
  )
}

/** A new fighter: a name, and which of the two free characters to start as. */
function CharacterCreator({ state, onDone }: { state: ArenaState; onDone: (s: ArenaState) => void }) {
  const { t, locale } = useI18n()
  const lang = locale === 'vi' ? 'vi' : 'en'
  const starters = state.roster.filter((c) => c.price === 0)
  const [name, setName] = useState('')
  const [pick, setPick] = useState(starters[0]?.id ?? 'beggar')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const chosen = starters.find((c) => c.id === pick) ?? starters[0]

  const submit = async () => {
    setBusy(true)
    setNote(null)
    try {
      onDone(await repository.createFighter(name, pick))
    } catch (err) {
      setNote(explain(err, t, t('error.server')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack gap-6 arena" data-testid="arena-create">
      <div>
        <h1 style={{ marginBottom: 2 }}>{t('arena.create.title')}</h1>
        <div className="card-meta">{t('arena.create.story')}</div>
      </div>
      <section className="card elev-sm arena-stage">
        {chosen && <FighterSprite character={chosen} label={name || chosen.name[lang]} />}
        <form
          className="stack gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label className="stack gap-1">
            <span className="card-kicker">{t('arena.create.name')}</span>
            <input className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} required />
          </label>
          <fieldset className="arena-choice">
            <legend>{t('arena.create.pick')}</legend>
            {starters.map((c) => (
              <label key={c.id} className="arena-swatch arena-swatch-wide">
                <input type="radio" name="starter" checked={pick === c.id} onChange={() => setPick(c.id)} />
                <span>{c.name[lang]}</span>
              </label>
            ))}
          </fieldset>
          {chosen && <SkillLine character={chosen} />}
          {note && (
            <div className="card-meta" role="alert">
              {note}
            </div>
          )}
          <div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {t('arena.create.go')}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

/** The tower: energy, the fighter's level, and a floor at a time to fight. */
function TowerSection({ playing }: { playing: Character }) {
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
          return (
            <li
              key={f.floor}
              className="card elev-sm arena-floor"
              data-boss={f.boss || undefined}
              data-locked={f.locked || undefined}
              aria-label={`${t('arena.tower.floor', f.floor)}: ${f.name[lang]}`}
            >
              <FighterSprite character={f.mirror ? playing : f.character} facing="left" size={72} animation="idle" />
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
              <FighterSprite character={r.character} facing="left" size={84} />
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
