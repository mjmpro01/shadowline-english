import { useState, type ReactNode } from 'react'
import type { Locale, Translate } from '../../i18n'
import type { MessageKey } from '../../i18n/en'
import { canSpeak, speak } from '../../lib/speak'
import type { Bilingual, GameState, MainQuest } from '../api'
import { Portrait, RewardChips, Sheet } from './common'
import { pick } from './util'

/**
 * Someone on the farm talking. The lines are English — the game is the
 * practice — and tapping one shows it in the learner's language underneath;
 * the speaker button reads it aloud.
 *
 * When the story has something for this person, their lines are the quest's,
 * followed by what it asks for and what it pays, and the reward is claimed
 * from here once it is done.
 */
export function Dialogue({
  speaker,
  lines,
  quest,
  state,
  locale,
  t,
  busy,
  onClose,
  onClaim,
  actions,
  children,
}: {
  speaker: string
  lines: Bilingual[]
  quest: MainQuest | null
  state: GameState | null
  locale: Locale
  t: Translate
  busy: boolean
  onClose: () => void
  onClaim: () => void
  actions?: ReactNode
  /** More to do with this person, under what they say: a chat in town. */
  children?: ReactNode
}) {
  const [shown, setShown] = useState<Set<number>>(new Set())
  const toggle = (i: number) =>
    setShown((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const name = t(`arena.npc.${speaker}` as Extract<MessageKey, 'arena.npc.mira'>)
  return (
    <Sheet title={quest ? pick(quest.title, locale) : name} onClose={onClose} t={t} wide>
      <div className="arena-dialogue">
        <div className="arena-speaker">
          <Portrait id={speaker} mood={quest?.done ? 1 : 0} />
          <span className="arena-speaker-name">{name}</span>
        </div>
        <div className="stack gap-2 arena-lines">
          {lines.map((line, i) => (
            <div key={i} className="arena-line">
              <button type="button" className="arena-line-text" onClick={() => toggle(i)} aria-expanded={shown.has(i)}>
                {line.en}
                {shown.has(i) && <span className="arena-line-vi">{line.vi}</span>}
              </button>
              {canSpeak() && (
                <button type="button" className="arena-speak" onClick={() => speak(line.en)} aria-label={t('arena.listen')}>
                  🔊
                </button>
              )}
            </div>
          ))}
          <p className="arena-muted arena-hint">{t('arena.tapToTranslate')}</p>
        </div>
      </div>
      {children}

      {quest && (
        <div className="arena-objective">
          <div className="arena-objective-head">
            <strong>{t('arena.objective')}</strong>
            {quest.target > 0 && (
              <span className="arena-muted">
                {quest.progress}/{quest.target}
              </span>
            )}
          </div>
          <p>{pick(quest.objective, locale)}</p>
          <div className="arena-objective-head">
            <span className="arena-muted">{t('arena.reward')}</span>
            <RewardChips reward={quest.reward} state={state} locale={locale} t={t} />
          </div>
          {quest.done && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onClaim}>
              {t('arena.claim')}
            </button>
          )}
        </div>
      )}
      {actions && <div className="arena-actions">{actions}</div>}
    </Sheet>
  )
}
