import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Locale, Translate } from '../../i18n'
import { canSpeak, speak } from '../../lib/speak'
import type { Battle, GameState, Turn } from '../api'
import {
  MONSTER_ATTACK_ROW,
  MONSTER_DOWN_ROW,
  MONSTER_HURT_ROW,
  MONSTER_ROWS,
  art,
  monsterColour,
  type ArtManifest,
} from '../assets'
import { spriteFrame, timeLeft, timeShare, type SpriteMove } from '../battle'
import { ItemIcon } from './common'
import { QuestionBody } from './QuestionBody'
import { pick, useNow } from './util'

/**
 * A fight: the monster, both health bars, and the question in play with its
 * clock. An answer goes to the server, which says whether it was right; the
 * word is then shown with its sound and meaning — the fight is practice — and
 * the next question follows.
 */
export function BattlePanel({
  battle,
  turn,
  state,
  locale,
  t,
  busy,
  skew,
  onAnswer,
  onNext,
  onFlee,
  onClose,
  artInfo,
}: {
  battle: Battle
  /** What the last answer did, shown until the player moves on. */
  turn: Turn | null
  state: GameState | null
  locale: Locale
  t: Translate
  busy: boolean
  skew: number
  onAnswer: (answer: string) => void
  onNext: () => void
  onFlee: () => void
  onClose: () => void
  /** How the monsters' strips are cut, when the art is drawn. */
  artInfo: ArtManifest | null
}) {
  const over = battle.state !== 'active'
  const name = pick(battle.monster.name, locale)
  const colour = monsterColour(battle.spawn, battle.monster.id)
  // What the monster does: goes down when beaten; takes the hit of a right
  // answer, strikes for a wrong one; otherwise it stands and breathes.
  const cue: { move: SpriteMove; key: string } =
    battle.state === 'won'
      ? { move: 'down', key: 'won' }
      : turn
        ? { move: turn.right ? 'hurt' : 'attack', key: `${battle.round}-${turn.right}` }
        : { move: 'idle', key: 'idle' }

  return (
    <div className="arena-sheet-wrap arena-battle-wrap">
      <section
        className="arena-sheet arena-sheet-wide arena-battle"
        role="dialog"
        aria-label={t('arena.battle.title', name)}
        data-boss={battle.monster.boss || undefined}
      >
        <header className="arena-battle-head">
          <div className="arena-fighter" data-hurt={turn?.right ? 'monster' : undefined} key={`m${battle.round}`}>
            <MonsterSprite
              id={battle.monster.id}
              colour={colour}
              artInfo={artInfo}
              cue={cue}
              boss={battle.monster.boss ?? false}
            />
            <div className="arena-fighter-info">
              <strong>
                {battle.monster.boss && <span className="arena-boss-tag">{t('arena.battle.boss')}</span>} {name}
              </strong>
              <HealthBar value={battle.monsterHp} max={battle.monsterHpMax} kind="monster" />
              {battle.phases > 1 && (
                <span className="arena-phase" data-testid="battle-phase">
                  {t('arena.battle.phase', battle.phase, battle.phases)}
                </span>
              )}
            </div>
          </div>
          <div className="arena-fighter arena-fighter-you" data-hurt={turn && !turn.right ? 'you' : undefined}>
            <div className="arena-fighter-info">
              <strong>{t('arena.battle.you')}</strong>
              <HealthBar value={battle.hp} max={battle.hpMax} kind="you" />
            </div>
          </div>
        </header>

        <div className="arena-sheet-body arena-battle-body">
          {turn ? (
            <TurnResult turn={turn} t={t} over={over} onNext={onNext} />
          ) : over ? (
            <Outcome battle={battle} state={state} locale={locale} t={t} onClose={onClose} />
          ) : (
            <QuestionView
              key={`${battle.id}-${battle.round}`}
              battle={battle}
              t={t}
              busy={busy}
              skew={skew}
              onAnswer={onAnswer}
            />
          )}
        </div>

        {!over && !turn && (
          <footer className="arena-battle-foot">
            <span className="arena-muted">{t('arena.battle.score', battle.right, battle.wrong)}</span>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onFlee}>
              {t('arena.battle.flee')}
            </button>
          </footer>
        )}
      </section>
    </div>
  )
}

function HealthBar({ value, max, kind }: { value: number; max: number; kind: 'monster' | 'you' }) {
  return (
    <div className="arena-health" data-kind={kind}>
      <div className="arena-bar" aria-hidden="true">
        <span style={{ width: `${(Math.max(0, value) / max) * 100}%` }} />
      </div>
      <span className="arena-stat-small">
        {Math.max(0, value)}/{max}
      </span>
    </div>
  )
}

/** Frames a second for the fight panel's monster. */
const SPRITE_FPS = 8

/**
 * The monster from its strip on the map, larger, acting out the turn: the
 * art's own frames when they are drawn, the still picture otherwise.
 */
function MonsterSprite({
  id,
  colour,
  artInfo,
  cue,
  boss,
}: {
  id: string
  colour: string | null
  artInfo: ArtManifest | null
  cue: { move: SpriteMove; key: string }
  boss: boolean
}) {
  const key = colour ? `monster-${id}-${colour}` : `monster-${id}`
  const strip = artInfo?.frames[key]
  const [failed, setFailed] = useState(false)
  const now = useNow(1000 / SPRITE_FPS)
  const file = art(`monsters/${colour ? `${id}_${colour}` : id}.png`)
  // The strip is drawn as a background, which says nothing when it is
  // missing: load it once to find out.
  useEffect(() => {
    const probe = new Image()
    probe.onerror = () => setFailed(true)
    probe.src = file
    return () => {
      probe.onerror = null
    }
  }, [file])
  // When the current move began, restarted by each new cue.
  const [since, setSince] = useState(() => ({ key: cue.key, at: now }))
  if (since.key !== cue.key) setSince({ key: cue.key, at: now })
  if (!strip || failed || strip.count < MONSTER_ROWS * 2) return <MonsterPicture id={id} colour={colour} />

  const cols = strip.count / MONSTER_ROWS
  const rows = { attack: MONSTER_ATTACK_ROW, hurt: MONSTER_HURT_ROW, down: MONSTER_DOWN_ROW }
  const frame = spriteFrame(cue.move, cols, rows, Math.max(0, now - since.at), SPRITE_FPS)
  return (
    <div
      className="arena-monster-sprite"
      data-boss={boss || undefined}
      data-move={cue.move}
      style={{
        backgroundImage: `url(${file})`,
        backgroundSize: `${strip.count * 100}% 100%`,
        backgroundPosition: `${(frame / (strip.count - 1)) * 100}% 0`,
        aspectRatio: `${strip.w} / ${strip.h}`,
      }}
    />
  )
}

/** The monster as drawn for a fight, in its spot's colour, or a painted
 *  stand-in until it is drawn. */
function MonsterPicture({ id, colour }: { id: string; colour: string | null }) {
  const [missing, setMissing] = useState(false)
  if (missing) return <MonsterStandIn id={id} />
  return (
    <img
      className="arena-monster-img"
      src={art(`monsters/${colour ? `${id}_${colour}` : id}_battle.png`)}
      alt=""
      onError={() => setMissing(true)}
    />
  )
}

function MonsterStandIn({ id }: { id: string }) {
  if (id === 'echo_bat') {
    return (
      <svg className="arena-monster-img" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M4 20 L16 16 L20 26 Z M44 20 L32 16 L28 26 Z" fill="#7e57c2" />
        <ellipse cx="24" cy="24" rx="8" ry="10" fill="#5e35b1" />
        <path d="M18 15 L20 9 L22 15 Z M26 15 L28 9 L30 15 Z" fill="#5e35b1" />
        <circle cx="21" cy="22" r="1.6" fill="#ffeb3b" />
        <circle cx="27" cy="22" r="1.6" fill="#ffeb3b" />
      </svg>
    )
  }
  return (
    <svg className="arena-monster-img" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M6 40 Q6 14 24 12 Q42 14 42 40 Z" fill="#7cb342" />
      <ellipse cx="17" cy="20" rx="4" ry="2.5" fill="#c5e1a5" />
      <circle cx="19" cy="28" r="2.2" fill="#1b1b1b" />
      <circle cx="29" cy="28" r="2.2" fill="#1b1b1b" />
      <path d="M21 34 Q24 36 27 34" stroke="#33691e" strokeWidth="1.6" fill="none" />
    </svg>
  )
}

/** The question in play, its clock, and the ways to answer it. */
function QuestionView({
  battle,
  t,
  busy,
  skew,
  onAnswer,
}: {
  battle: Battle
  t: Translate
  busy: boolean
  skew: number
  onAnswer: (answer: string) => void
}) {
  const q = battle.question
  const serverNow = useNow(100) + skew
  const left = timeLeft(battle.deadline, serverNow)
  const share = timeShare(battle.issuedAt, battle.deadline, serverNow)
  // One answer a question: the player's, or the clock's.
  const sent = useRef(false)
  const send = useCallback(
    (answer: string) => {
      if (sent.current || busy) return
      sent.current = true
      onAnswer(answer)
    },
    [busy, onAnswer],
  )

  // Time up: an empty answer, which the server counts as wrong.
  useEffect(() => {
    if (left <= 0) send('')
  }, [left, send])

  return (
    <QuestionBody q={q} t={t} busy={busy} onAnswer={send}>
      <div className="arena-clock" aria-hidden="true" data-low={left < 4}>
        <span style={{ width: `${share * 100}%` }} />
      </div>
      <p className="arena-muted arena-question-ask">
        {t(`arena.battle.ask.${q.kind}`)} · {Math.ceil(left)}s
      </p>
    </QuestionBody>
  )
}

/** What the last answer did, and the word, before the next question. */
function TurnResult({ turn, t, over, onNext }: { turn: Turn; t: Translate; over: boolean; onNext: () => void }) {
  // A right answer moves on by itself; a wrong one waits to be read.
  useEffect(() => {
    if (!turn.right || over) return
    const id = window.setTimeout(onNext, 1600)
    return () => window.clearTimeout(id)
  }, [turn, over, onNext])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNext])

  return (
    <div className="arena-turn" data-right={turn.right}>
      <p className="arena-turn-verdict">
        {turn.right ? t('arena.battle.right') : turn.late ? t('arena.battle.late') : t('arena.battle.wrong')}
        {turn.right && turn.strike > 1 && <span className="arena-muted"> {t('arena.battle.critical')}</span>}
        {!turn.right && <span className="arena-turn-hit"> {t('arena.battle.hit', turn.hit)}</span>}
      </p>
      <div className="arena-word-head">
        <div>
          <div className="arena-word-text">{turn.entry.word}</div>
          {turn.entry.ipa && <div className="arena-word-ipa">/{turn.entry.ipa}/</div>}
        </div>
        {canSpeak() && (
          <button type="button" className="btn btn-secondary" onClick={() => speak(turn.entry.word)}>
            🔊
          </button>
        )}
      </div>
      {turn.entry.meaning && <p className="arena-word-meaning">{turn.entry.meaning}</p>}
      {!turn.right && turn.answer.toLowerCase() !== turn.entry.word.toLowerCase() && (
        <p className="arena-muted">
          {t('arena.battle.answerWas')} {turn.answer}
        </p>
      )}
      <button type="button" className="btn btn-primary" onClick={onNext} autoFocus>
        {t('arena.battle.next')}
      </button>
    </div>
  )
}

/** How the fight ended. */
function Outcome({
  battle,
  state,
  locale,
  t,
  onClose,
}: {
  battle: Battle
  state: GameState | null
  locale: Locale
  t: Translate
  onClose: () => void
}) {
  const drop = battle.drop ? state?.shop.find((s) => s.id === battle.drop) : undefined
  return (
    <div className="arena-outcome stack gap-3" data-state={battle.state}>
      <p className="arena-turn-verdict">
        {battle.state === 'won'
          ? t('arena.battle.won')
          : battle.state === 'lost'
            ? t('arena.battle.lost')
            : t('arena.battle.fled')}
      </p>
      <p className="arena-muted">{t('arena.battle.score', battle.right, battle.wrong)}</p>
      {battle.state === 'won' && (
        <div className="arena-chips">
          <span className="arena-chip">
            <ItemIcon id="coin" size={20} /> +{battle.gold}
          </span>
          {battle.drop && (
            <span className="arena-chip">
              {t('arena.battle.drop')} <ItemIcon id={battle.drop} size={20} />{' '}
              {drop ? pick(drop.name, locale) : battle.drop}
            </span>
          )}
        </div>
      )}
      {battle.state === 'lost' && <p>{t('arena.battle.lostText', battle.fine)}</p>}
      {battle.words.length > 0 && (
        <div>
          <p className="arena-muted">{t('arena.battle.words')}</p>
          <p className="arena-word-list">{battle.words.join(' · ')}</p>
          <Link to="/vocabulary">{t('arena.word.open')}</Link>
        </div>
      )}
      <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
        {battle.state === 'lost' ? t('arena.battle.home') : t('arena.battle.done')}
      </button>
    </div>
  )
}
