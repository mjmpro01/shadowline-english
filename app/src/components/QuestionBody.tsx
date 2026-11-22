import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { optionKey, pickLetter, pickTile, spelled, type Picks } from '../lib/duel'
import { canSpeak, speak } from '../lib/speak'
import type { DuelQuestion } from '../repository'

/**
 * A duel's question and the ways to answer it: four to choose from, with keys
 * 1–4, or letters to put in order, typed or tapped. A word to hear is said as
 * it appears.
 */
export function QuestionBody({
  q,
  busy,
  onAnswer,
  children,
}: {
  q: DuelQuestion
  busy: boolean
  onAnswer: (answer: string) => void
  /** What goes above the question: the clock. */
  children?: ReactNode
}) {
  const t = useT()
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
    <div className="duel-question" data-kind={q.kind}>
      {children}
      <p className="duel-ask">{t(`arena.ask.${q.kind}`)}</p>

      {q.kind === 'meaning' && <p className="duel-word">{q.prompt}</p>}
      {q.kind === 'ipa' && <p className="duel-word duel-ipa">/{q.prompt}/</p>}
      {q.kind === 'listen' && (
        <button type="button" className="btn btn-secondary duel-hear" onClick={() => q.say && speak(q.say)}>
          🔊 {t('arena.ask.hearAgain')}
        </button>
      )}
      {q.kind === 'scramble' && <p className="duel-hint">{q.prompt}</p>}

      {q.kind === 'scramble' ? (
        <div className="duel-scramble">
          <div className="duel-spelled" aria-live="polite">
            {q.options.map((_, i) => (
              <span key={i} className="duel-slot">
                {picks[i] !== undefined ? q.options[picks[i]] : ''}
              </span>
            ))}
          </div>
          <div className="duel-tiles">
            {q.options.map((letter, i) => (
              <button
                key={i}
                type="button"
                className="duel-tile"
                disabled={busy || picks.includes(i)}
                onClick={() => setPicks((p) => pickTile(p, i))}
              >
                {letter}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setPicks([])}>
            {t('arena.ask.clear')}
          </button>
        </div>
      ) : (
        <>
          <div className="duel-options" data-long={q.kind === 'meaning'}>
            {q.options.map((option, i) => (
              <button key={option} type="button" className="duel-option" disabled={busy} onClick={() => send(option)}>
                <kbd className="duel-kbd">{i + 1}</kbd>
                <span>{option}</span>
              </button>
            ))}
          </div>
          <p className="card-meta duel-keys">{t('arena.ask.keys')}</p>
        </>
      )}
    </div>
  )
}
