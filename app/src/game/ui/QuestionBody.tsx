import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Translate } from '../../i18n'
import { canSpeak, speak } from '../../lib/speak'
import type { Question } from '../api'
import { optionKey, pickLetter, pickTile, spelled, type Picks } from '../battle'

/**
 * A question and the ways to answer it: four to choose from, with keys 1–4,
 * or letters to put in order, typed or tapped. A word to hear is said as it
 * appears. Used in a fight, under its clock, and in the Word Hall's rooms,
 * where there is none.
 */
export function QuestionBody({
  q,
  t,
  busy,
  onAnswer,
  children,
}: {
  q: Question
  t: Translate
  busy: boolean
  onAnswer: (answer: string) => void
  /** What goes above the question: a fight's clock, a room's ask. */
  children?: ReactNode
}) {
  const [picks, setPicks] = useState<Picks>([])
  const sent = useRef(false)

  const send = useCallback(
    (answer: string) => {
      if (sent.current || busy) return
      sent.current = true
      onAnswer(answer)
    },
    [busy, onAnswer],
  )

  // A listening question says its word as it appears.
  useEffect(() => {
    if (q.kind === 'listen' && q.say && canSpeak()) speak(q.say)
  }, [q.kind, q.say])

  // Keys: 1–4 to choose; letters, Backspace and Enter for the scramble.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (q.kind === 'scramble') {
        if (e.key === 'Backspace') setPicks((p) => p.slice(0, -1))
        else if (e.key === 'Enter') send(spelled(q.options, picks))
        else if (/^[a-z]$/i.test(e.key)) setPicks((p) => pickLetter(q.options, p, e.key))
        return
      }
      const i = optionKey(e.key, q.options.length)
      if (i >= 0) send(q.options[i])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [q, picks, send])

  // A full spelling is checked as soon as it is complete.
  useEffect(() => {
    if (q.kind === 'scramble' && picks.length === q.options.length) send(spelled(q.options, picks))
  }, [picks, q, send])

  return (
    <div className="arena-question" data-kind={q.kind}>
      {children}

      {q.kind === 'meaning' && <p className="arena-question-word">{q.prompt}</p>}
      {q.kind === 'ipa' && <p className="arena-question-word arena-ipa">/{q.prompt}/</p>}
      {q.kind === 'listen' && (
        <button type="button" className="btn btn-secondary arena-hear" onClick={() => q.say && speak(q.say)}>
          🔊 {t('arena.battle.hearAgain')}
        </button>
      )}
      {q.kind === 'scramble' && <p className="arena-question-hint">{q.prompt}</p>}

      {q.kind === 'scramble' ? (
        <div className="arena-scramble">
          <div className="arena-spelled" aria-live="polite">
            {q.options.map((_, i) => (
              <span key={i} className="arena-slot">
                {picks[i] !== undefined ? q.options[picks[i]] : ''}
              </span>
            ))}
          </div>
          <div className="arena-tiles">
            {q.options.map((letter, i) => (
              <button
                key={i}
                type="button"
                className="arena-tile"
                disabled={busy || picks.includes(i)}
                onClick={() => setPicks((p) => pickTile(p, i))}
              >
                {letter}
              </button>
            ))}
          </div>
          <div className="arena-actions">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setPicks([])}>
              {t('arena.battle.clear')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="arena-options" data-long={q.kind === 'meaning'}>
            {q.options.map((option, i) => (
              <button
                key={option}
                type="button"
                className="arena-option"
                disabled={busy}
                onClick={() => send(option)}
              >
                <kbd className="arena-kbd">{i + 1}</kbd>
                <span>{option}</span>
              </button>
            ))}
          </div>
          <p className="arena-muted arena-hint arena-keys">{t('arena.battle.keys')}</p>
        </>
      )}
    </div>
  )
}
