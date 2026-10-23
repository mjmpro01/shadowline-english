import { useEffect, useRef, useState } from 'react'
import type { Locale, Translate } from '../../i18n'
import { canSpeak, speak } from '../../lib/speak'
import type { GameState, Hall, Letter, Library, Quiz, QuizAnswer } from '../api'
import { optionKey } from '../battle'
import { RewardChips, Sheet } from './common'
import { Line } from './TownChat'
import { pick } from './util'

/**
 * The second half of Echo Town on screen: the Word Hall's door with the Lexi's
 * notes, Lina's library, and the day's letter. Every answer is the server's to
 * judge; these show the choices, and then what the word was.
 */

/** Four choices, with keys 1 to 4 while they are on screen. */
function Choices({ quiz, busy, onPick }: { quiz: Quiz; busy: boolean; onPick: (answer: string) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const i = optionKey(e.key, quiz.options.length)
      if (i >= 0 && !busy) onPick(quiz.options[i])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quiz, busy, onPick])
  return (
    <div className="arena-options" data-long={quiz.kind === 'meaning'}>
      {quiz.options.map((o, i) => (
        <button key={o} type="button" className="arena-option" disabled={busy} onClick={() => onPick(o)}>
          <kbd className="arena-kbd">{i + 1}</kbd>
          <span>{o}</span>
        </button>
      ))}
    </div>
  )
}

/** What the word was, with its sound: shown after any answer. */
function TheWord({ answer, t }: { answer: QuizAnswer; t: Translate }) {
  return (
    <p className="arena-word-told">
      <strong>{answer.word}</strong> <span className="arena-ipa">/{answer.ipa}/</span>
      {canSpeak() && (
        <button type="button" className="arena-speak" onClick={() => speak(answer.word)} aria-label={t('arena.listen')}>
          🔊
        </button>
      )}
      <span className="arena-muted"> — {answer.meaning}</span>
    </p>
  )
}

export function HallPanel({
  hall,
  result,
  roomsOpen,
  t,
  busy,
  onRead,
  onNext,
  onEnter,
  onClose,
}: {
  /** Null while the door is being looked at. */
  hall: Hall | null
  result: QuizAnswer | null
  /** Chapter 4: the doors are open, and the rooms inside wait. */
  roomsOpen: boolean
  t: Translate
  busy: boolean
  onRead: (answer: string) => void
  onNext: () => void
  onEnter: () => void
  onClose: () => void
}) {
  return (
    <Sheet title={t('arena.hall.title')} onClose={onClose} t={t}>
      <div className="arena-hall stack gap-3">
        {roomsOpen ? (
          <>
            <p className="arena-muted">{t('arena.hall.open')}</p>
            <button type="button" className="btn btn-primary" onClick={onEnter}>
              {t('arena.rooms.enter')}
            </button>
          </>
        ) : (
          <p className="arena-muted">{t('arena.hall.closed')}</p>
        )}
        {!hall ? (
          <p className="arena-muted">{t('arena.loading')}</p>
        ) : !hall.glasses ? (
          <>
            <p>{t('arena.hall.unreadable')}</p>
            <p className="arena-muted">{t('arena.hall.askSage')}</p>
          </>
        ) : (
          <>
            <p className="arena-muted" data-testid="notes-read">
              {t('arena.hall.read', hall.read, hall.perDay)}
            </p>
            {result ? (
              <section className="arena-turn" data-right={result.right}>
                <p className="arena-turn-verdict">{result.right ? t('arena.hall.right') : t('arena.hall.wrong')}</p>
                <p className="arena-muted">{t('arena.hall.was')}</p>
                <TheWord answer={result} t={t} />
                {result.gold > 0 && <p className="arena-muted">+{result.gold} 🪙</p>}
                {hall.read < hall.perDay && (
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={onNext}>
                    {t('arena.hall.next')}
                  </button>
                )}
              </section>
            ) : hall.note ? (
              <section className="arena-question" data-kind="ipa">
                <p className="arena-muted">{t('arena.hall.prompt')}</p>
                <p className="arena-question-word arena-ipa">/{hall.note.prompt}/</p>
                <Choices quiz={hall.note} busy={busy} onPick={onRead} />
              </section>
            ) : (
              <p>{t('arena.hall.done')}</p>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}

export function LibraryPanel({
  library,
  result,
  state,
  locale,
  t,
  busy,
  onSearch,
  onAsk,
  onAnswer,
  onClaim,
  onAnother,
  onClose,
}: {
  library: Library | null
  result: QuizAnswer | null
  state: GameState
  locale: Locale
  t: Translate
  busy: boolean
  onSearch: (q: string) => void
  onAsk: (word: string) => void
  onAnswer: (answer: string) => void
  onClaim: (words: number) => void
  onAnother: () => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  // Searching as the player types, once they pause. The shelves are already
  // being fetched when the panel opens, so the first, empty search is skipped.
  const typed = useRef(false)
  useEffect(() => {
    if (!typed.current) {
      typed.current = true
      return
    }
    const id = window.setTimeout(() => onSearch(query.trim()), 250)
    return () => window.clearTimeout(id)
  }, [query, onSearch])

  return (
    <Sheet title={t('arena.library.title')} onClose={onClose} t={t} wide>
      {!library ? (
        <p className="arena-muted">{t('arena.loading')}</p>
      ) : (
        <div className="arena-library stack gap-3">
          <p data-testid="library-donated">
            <strong>{t('arena.library.donated', library.donated)}</strong>
          </p>
          <div className="arena-chips arena-milestones">
            {library.milestones.map((m) => (
              <span key={m.words} className="arena-chip" data-reached={m.reached} data-claimed={m.claimed}>
                {m.claimed ? '✓ ' : ''}
                {t('arena.library.milestone', m.words)}
                {m.reached && !m.claimed && (
                  <button type="button" className="arena-link-btn" disabled={busy} onClick={() => onClaim(m.words)}>
                    {t('arena.library.collect')}
                  </button>
                )}
                {!m.claimed && <RewardChips reward={m.reward} state={state} locale={locale} t={t} />}
              </span>
            ))}
          </div>

          {result ? (
            <section className="arena-turn" data-right={result.right}>
              <p className="arena-turn-verdict">
                {result.right ? t('arena.library.right', result.word) : t('arena.library.wrong')}
              </p>
              <p className="arena-muted">{t('arena.library.meaning')}</p>
              <TheWord answer={result} t={t} />
              <button type="button" className="btn btn-primary" disabled={busy} onClick={onAnother}>
                {t('arena.library.another')}
              </button>
            </section>
          ) : library.asked ? (
            <section className="arena-question" data-kind="meaning">
              <p className="arena-turn-verdict">{t('arena.library.ask', library.askedWord)}</p>
              <Choices quiz={library.asked} busy={busy} onPick={onAnswer} />
            </section>
          ) : (
            <>
              <p className="arena-muted">{t('arena.library.pick')}</p>
              <input
                className="input"
                type="search"
                value={query}
                placeholder={t('arena.library.search')}
                aria-label={t('arena.library.search')}
                onChange={(e) => setQuery(e.target.value)}
              />
              {library.words.length === 0 ? (
                <p className="arena-muted">{t('arena.library.none')}</p>
              ) : (
                <div className="arena-chips arena-library-words">
                  {library.words.map((w) => (
                    <button
                      key={w.word}
                      type="button"
                      className="arena-chip arena-chip-btn"
                      disabled={busy}
                      onClick={() => onAsk(w.word)}
                    >
                      {w.word}
                    </button>
                  ))}
                  {library.available > library.words.length && (
                    <span className="arena-muted">{t('arena.library.more', library.available - library.words.length)}</span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}

export function LetterPanel({
  letter,
  locale,
  t,
  onClose,
}: {
  letter: Letter
  locale: Locale
  t: Translate
  onClose: () => void
}) {
  const name = pick(letter.from.name, locale)
  return (
    <Sheet title={t('arena.letter.title', name)} onClose={onClose} t={t}>
      <div className="arena-letter stack gap-3">
        <p className="arena-muted">{t('arena.tapToTranslate')}</p>
        <div className="arena-letter-body">
          {letter.body.map((line, i) => (
            <Line key={i} text={line} t={t} speakable />
          ))}
        </div>
        {letter.done ? (
          <p className="arena-turn-verdict">{t('arena.letter.done')}</p>
        ) : (
          <>
            <p>{t('arena.letter.bring', name)}</p>
            <p className="arena-muted">{t('arena.letter.reward', letter.gold)}</p>
          </>
        )}
      </div>
    </Sheet>
  )
}
