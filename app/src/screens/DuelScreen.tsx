import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FighterSprite } from '../components/FighterSprite'
import { QuestionBody } from '../components/QuestionBody'
import { useI18n } from '../i18n'
import { artURL, loadArt, stageFor, type Animation, type ArtManifest } from '../lib/arenaArt'
import { percent, swing, timeShare } from '../lib/duel'
import { play, setSoundOn, soundOn, unlockSound, type Sfx } from '../lib/sfx'
import { explain } from '../lib/errors'
import { repository, type ArenaState, type Duel, type DuelTurn } from '../repository'
import '../styles/arena.css'

/** A skill's flash, in the colour of what it does. */
const SKILL_FLASH: Record<string, string> = {
  crit: '#ff7828',
  combo: '#ffdc5a',
  drain: '#dc283c',
  heal: '#50d278',
  stun: '#fae650',
  focus: '#50a0ff',
}

/** A blow worth calling critical: a crit skill, or a heavy hit right away. */
function critical(turn: DuelTurn): boolean {
  return (turn.move === 'special' && turn.skill === 'crit') || (turn.move === 'heavy' && turn.speed >= 80)
}

/** How long a turn's blows play before the next question. */
const TURN_MS = 1100
/** How long after the learner's blow the opponent's comes back. */
const COUNTER_MS = 350

/**
 * A word duel: the learner on the left, the floor's fighter on the right,
 * health above, rage below, and the question between. The server decides
 * every answer; this screen plays what it says happened.
 */
export function DuelScreen() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const lang = locale === 'vi' ? 'vi' : 'en'
  const [arena, setArena] = useState<ArenaState | null>(null)
  const [duel, setDuel] = useState<Duel | null>(null)
  const [turn, setTurn] = useState<DuelTurn | null>(null)
  // The fighters' moves; beat 2 is the opponent hitting back a late answer.
  const [moves, setMoves] = useState<{ me: Animation; opp: Animation; key: number; beat?: 2 }>({ me: 'idle', opp: 'idle', key: 0 })
  // The stage's weight for a blow: a shake, a flash in a colour.
  const [impact, setImpact] = useState<{ shake?: 'light' | 'strong'; flash?: string; key: number }>({ key: 0 })
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [share, setShare] = useState(1)
  const [sound, setSound] = useState(soundOn)
  const [art, setArt] = useState<ArtManifest | null>(null)
  const timedOut = useRef<number | null>(null)
  const lastTick = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    void loadArt().then((m) => alive && setArt(m))
    void Promise.all([repository.arena(), repository.duel()])
      .then(([a, d]) => {
        if (!alive) return
        if (!d) {
          navigate('/arena', { replace: true })
          return
        }
        setArena(a)
        setDuel(d)
      })
      .catch((err) => alive && setNote(explain(err, t, t('arena.loadFailed'))))
    return () => {
      alive = false
    }
  }, [navigate, t])

  const answer = useCallback(
    async (given: string) => {
      if (!duel || busy || duel.state !== 'active') return
      // A tap: the moment a phone lets the page make sound.
      unlockSound()
      setBusy(true)
      setNote(null)
      try {
        const result = await repository.answerDuel(duel, given, armed)
        setArmed(false)
        setTurn(result.turn)
        const turn = result.turn
        const hurt = turn.taken / Math.max(1, duel.hpMax)
        if (turn.move === 'hit') {
          // Wrong or late: they strike; a big attack missed is their own skill.
          const theirs: Animation = duel.block ? 'special' : 'light'
          setMoves((m) => ({ me: 'hit', opp: theirs, key: m.key + 1 }))
          setImpact((i) => ({ shake: duel.block || hurt > 0.25 ? 'strong' : 'light', key: i.key + 1 }))
        } else {
          // The learner's blow first; a late one is hit back a moment after.
          setMoves((m) => ({ me: turn.move, opp: turn.dealt > 0 ? 'hit' : 'idle', key: m.key + 1 }))
          setImpact((i) => ({
            shake: turn.move === 'special' ? 'strong' : turn.move === 'heavy' ? 'light' : undefined,
            flash: turn.move === 'special' ? SKILL_FLASH[turn.skill ?? 'crit'] : turn.move === 'heavy' ? '#ffffff' : undefined,
            key: i.key + 1,
          }))
          if (turn.countered) {
            window.setTimeout(() => {
              setMoves((m) => ({ me: 'hit', opp: 'light', key: m.key + 1, beat: 2 }))
              setImpact((i) => ({ shake: hurt > 0.25 ? 'strong' : 'light', key: i.key + 1 }))
              play('hit')
            }, COUNTER_MS)
          }
        }
        play(turn.move as Sfx)
        window.setTimeout(() => {
          setDuel(result.duel)
          const over = result.duel.state !== 'active'
          if (over) play(result.duel.state === 'won' ? 'win' : 'ko')
          setMoves((m) => ({
            me: over ? (result.duel.state === 'won' ? 'win' : 'ko') : 'idle',
            opp: over ? (result.duel.state === 'won' ? 'ko' : 'win') : 'idle',
            key: m.key + 1,
          }))
          setBusy(false)
        }, TURN_MS)
      } catch (err) {
        setNote(explain(err, t, t('error.server')))
        // A turn already played, or a duel already over: see where it stands.
        const now = await repository.duel().catch(() => null)
        if (now) setDuel(now)
        setBusy(false)
      }
    },
    [duel, busy, armed, t],
  )

  // The clock: the share of the time left, and an empty answer when it runs out.
  useEffect(() => {
    if (!duel || duel.state !== 'active' || !duel.question) return
    const deadline = Date.parse(duel.deadline)
    const issued = deadline - duel.seconds * 1000
    const tick = window.setInterval(() => {
      const now = Date.now()
      setShare(timeShare(issued, deadline, now))
      // The last three seconds tick.
      const left = Math.ceil((deadline - now) / 1000)
      if (left > 0 && left <= 3 && lastTick.current !== left) {
        lastTick.current = left
        play('tick')
      }
      if (now > deadline + 300 && timedOut.current !== duel.turn) {
        timedOut.current = duel.turn
        void answer('')
      }
    }, 100)
    return () => window.clearInterval(tick)
  }, [duel, answer])

  if (note && !duel) return <div className="card-meta">{note}</div>
  if (!duel || !arena?.fighter) return <div className="card-meta" aria-busy="true" />

  const me = arena.fighter
  const mine = arena.roster.find((c) => c.id === me.character) ?? arena.roster[0]
  const o = duel.opponent
  const theirs = o.mirror ? mine : o.character
  const stage = stageFor(duel.kind, duel.floor)
  const stageArt = art?.stages?.[stage]

  return (
    <div className="duel" data-testid="duel">
      <div className="duel-hud">
        <HealthBar name={`${me.name} (${t('arena.duel.you')})`} hp={duel.hp} max={duel.hpMax} side="left" />
        <div className="duel-round">
          <span className="card-kicker">
            {duel.kind === 'pvp' ? t('arena.pvp.rating', duel.opponent.rating ?? 0) : t('arena.tower.floor', duel.floor)}
          </span>
          <strong>{t('arena.duel.round', duel.turn)}</strong>
          <button
            type="button"
            className="btn btn-ghost duel-sound"
            aria-pressed={sound}
            aria-label={sound ? t('arena.sound.on') : t('arena.sound.off')}
            title={sound ? t('arena.sound.on') : t('arena.sound.off')}
            onClick={() => {
              setSoundOn(!sound)
              setSound(!sound)
              if (!sound) unlockSound()
            }}
          >
            {sound ? '🔊' : '🔇'}
          </button>
        </div>
        <HealthBar
          name={duel.kind === 'pvp' ? t('arena.pvp.vs', o.name[lang]) : o.name[lang]}
          hp={duel.oppHp}
          max={duel.oppMax}
          side="right"
          boss={o.boss}
        />
      </div>

      <div
        className="duel-stage"
        data-stage={stage}
        data-art={stageArt ? '' : undefined}
        data-boss={o.boss ? '' : undefined}
        style={stageArt ? ({ '--stage': `url("${artURL(stageArt)}")` } as CSSProperties) : undefined}
        data-shake={impact.shake}
        key={`stage-${impact.key}`}
      >
        {impact.flash && <span className="duel-flash" style={{ '--flash': impact.flash } as CSSProperties} aria-hidden="true" />}
        <div className="duel-fighter" key={`me-${moves.key}`}>
          <FighterSprite character={mine} animation={moves.me} skill={turn?.skill} label={me.name} size={200} />
          {turn && moves.key > 0 && turn.taken > 0 && (moves.beat === 2 || !turn.countered) && (
            <span className="duel-pop duel-pop-hurt">−{turn.taken}</span>
          )}
          {turn && moves.key > 0 && !moves.beat && (turn.healed ?? 0) > 0 && <span className="duel-pop duel-pop-heal">+{turn.healed}</span>}
        </div>
        <div className="duel-fighter" key={`opp-${moves.key}`}>
          <FighterSprite
            character={theirs}
            animation={moves.opp}
            skill={moves.opp === 'special' ? theirs.skill.kind : undefined}
            facing="left"
            label={o.name[lang]}
            size={o.boss ? 230 : 200}
          />
          {turn && moves.key > 0 && !moves.beat && turn.dealt > 0 && (
            <span className={`duel-pop${critical(turn) ? ' duel-pop-crit' : ''}`}>
              −{turn.dealt}
              {critical(turn) && <small>{t('arena.duel.crit')}</small>}
            </span>
          )}
        </div>
      </div>

      {duel.state === 'active' && duel.question ? (
        <section className="card elev-sm duel-panel" aria-live="polite">
          {turn && (
            <div className="duel-verdict" data-right={turn.right} role="status">
              <strong>
                {turn.late
                  ? t('arena.duel.late')
                  : turn.move === 'special' && turn.skill
                    ? `${mine.skill.name[lang]}!`
                    : t(`arena.duel.move.${turn.move}`)}
              </strong>
              {!turn.right && <span>{t('arena.duel.wasAnswer', turn.answer)}</span>}
              {turn.right && (turn.move === 'light' || turn.move === 'heavy') && (
                <span className="duel-speed" data-fast={turn.speed >= 50}>
                  {turn.speed >= 50
                    ? t('arena.duel.fast', swing(turn.speed).toFixed(1))
                    : t('arena.duel.slow', swing(turn.speed).toFixed(1))}
                </span>
              )}
              {turn.countered && !turn.shielded && turn.taken > 0 && <span>{t('arena.duel.countered', turn.taken)}</span>}
              {(turn.healed ?? 0) > 0 && <span>{t('arena.duel.healed', turn.healed ?? 0)}</span>}
              {turn.move === 'special' && turn.skill === 'stun' && <span>{t('arena.duel.stunned')}</span>}
              {turn.shielded && <span>{t('arena.duel.shielded')}</span>}
              {(turn.focus ?? 0) > 0 && <span>{t('arena.duel.focused', turn.focus ?? 0)}</span>}
            </div>
          )}
          {duel.block && <div className="duel-telegraph">{t('arena.duel.telegraph')}</div>}
          <QuestionBody key={duel.turn} q={duel.question} busy={busy} onAnswer={(a) => void answer(a)}>
            <div className="duel-clock" data-low={share < 0.3}>
              <span style={{ width: `${Math.round(share * 100)}%` }} />
            </div>
          </QuestionBody>
          <div className="duel-bottom">
            <div className="duel-rage" aria-label={t('arena.duel.rage')}>
              <span className="card-kicker">{t('arena.duel.rage')}</span>
              <div className="duel-bar duel-bar-rage" data-full={duel.rage >= 100}>
                <span style={{ width: `${percent(duel.rage, 100)}%` }} />
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary duel-special"
              disabled={duel.rage < 100 || busy || armed || duel.block}
              onClick={() => setArmed(true)}
            >
              🔥 {mine.skill.name[lang]}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void repository.fleeDuel().finally(() => navigate('/arena'))}
            >
              {t('arena.duel.flee')}
            </button>
          </div>
          {armed && <div className="card-meta duel-armed">{t('arena.duel.specialArmed')}</div>}
          {note && <div className="card-meta" role="alert">{note}</div>}
        </section>
      ) : (
        <Outcome
          duel={duel}
          onDuel={(next) => {
            setTurn(null)
            setArmed(false)
            setMoves((m) => ({ me: 'idle', opp: 'idle', key: m.key + 1 }))
            setDuel(next)
          }}
        />
      )}
    </div>
  )
}

function HealthBar({ name, hp, max, side, boss }: { name: string; hp: number; max: number; side: 'left' | 'right'; boss?: boolean }) {
  const { t } = useI18n()
  return (
    <div className="duel-health" data-side={side}>
      <div className="duel-health-name">
        <strong>{name}</strong>
        {boss && <span className="tag tag-neutral">{t('arena.tower.boss')}</span>}
      </div>
      <div className="duel-bar" role="meter" aria-label={name} aria-valuemin={0} aria-valuemax={max} aria-valuenow={hp}>
        <span style={{ width: `${percent(hp, max)}%` }} data-low={hp / Math.max(1, max) < 0.3} />
      </div>
      <span className="mono duel-health-num">
        {hp}/{max}
      </span>
    </div>
  )
}

function Outcome({ duel, onDuel }: { duel: Duel; onDuel: (d: Duel) => void }) {
  const { t } = useI18n()
  const [note, setNote] = useState<string | null>(null)
  const won = duel.state === 'won'
  const fight = async (floor: number) => {
    setNote(null)
    try {
      onDuel(await repository.startDuel(floor))
    } catch (err) {
      setNote(explain(err, t, t('error.server')))
    }
  }
  return (
    <section className="card elev-sm duel-outcome" data-won={won} aria-labelledby="duel-outcome-title">
      <h2 id="duel-outcome-title">{won ? t('arena.duel.won') : t('arena.duel.lost')}</h2>
      {won ? (
        <div className="stack gap-1">
          <div className="duel-paid">🪙 {t('arena.duel.paid', duel.coins)} · {t('arena.duel.xpGained', duel.xp)}</div>
          {duel.kind === 'pvp' && <RatingChange delta={duel.ratingDelta} />}
          {duel.firstClear && <div className="card-meta">{t('arena.duel.firstClear')}</div>}
          {duel.bonus > 0 && <div className="duel-paid">🏆 {t('arena.duel.bonus', duel.bonus)}</div>}
          {duel.levelUp && <div className="duel-levelup">⭐ {t('arena.duel.levelUp')}</div>}
        </div>
      ) : (
        <>
          <p className="card-meta">{t('arena.duel.lostText')}</p>
          {duel.kind === 'pvp' && <RatingChange delta={duel.ratingDelta} />}
        </>
      )}
      {duel.words.length > 0 && (
        <div className="stack gap-1">
          <span className="card-kicker">{t('arena.duel.words')}</span>
          <div className="row gap-2 wrap">
            {duel.words.map((w) => (
              <span key={w} className="tag tag-neutral">
                {w}
              </span>
            ))}
          </div>
        </div>
      )}
      {note && <div className="card-meta" role="alert">{note}</div>}
      <div className="row gap-2 wrap">
        {duel.kind === 'pvp' && (
          <Link className="btn btn-primary" to="/arena">
            {t('arena.pvp.again')}
          </Link>
        )}
        {duel.kind !== 'pvp' && won && duel.floor < 15 && (
          <button type="button" className="btn btn-primary" onClick={() => void fight(duel.floor + 1)}>
            {t('arena.duel.nextFloor')}
          </button>
        )}
        {duel.kind !== 'pvp' && (
          <button type="button" className="btn btn-secondary" onClick={() => void fight(duel.floor)}>
            {t('arena.duel.again')}
          </button>
        )}
        <Link className="btn btn-ghost" to="/arena">
          {t('arena.duel.back')}
        </Link>
      </div>
    </section>
  )
}

function RatingChange({ delta }: { delta: number }) {
  const { t } = useI18n()
  return (
    <div className="duel-rating" data-up={delta >= 0}>
      {delta >= 0 ? t('arena.pvp.ratingUp', delta) : t('arena.pvp.ratingDown', -delta)}
    </div>
  )
}
