import { useState } from 'react'
import type { Locale, Translate } from '../../i18n'
import { canSpeak, speak } from '../../lib/speak'
import type { GameState, Question, QuizAnswer, Rooms } from '../api'
import { QuestionBody } from './QuestionBody'
import { RewardChips, Sheet } from './common'
import { pick } from './util'

/**
 * Inside the Word Hall: its rooms, each a topic, each three bundles of four
 * words. An empty place shows what its word means; tapping it asks for the
 * word — heard among the room's others, or spelled from its letters — and a
 * word brought back stays. The server keeps the answers and the count.
 */
export function RoomsPanel({
  rooms,
  asking,
  result,
  state,
  locale,
  t,
  busy,
  onAsk,
  onAnswer,
  onBack,
  onClaim,
  onClose,
}: {
  rooms: Rooms | null
  /** The question for a place, while it is being answered. */
  asking: Question | null
  result: QuizAnswer | null
  state: GameState
  locale: Locale
  t: Translate
  busy: boolean
  onAsk: (place: string) => void
  onAnswer: (answer: string) => void
  onBack: () => void
  onClaim: (bundle: string) => void
  onClose: () => void
}) {
  const [chosen, setChosen] = useState<string | null>(null)
  if (!rooms) {
    return (
      <Sheet title={t('arena.rooms.title')} onClose={onClose} t={t} wide>
        <p className="arena-muted">{t('arena.loading')}</p>
      </Sheet>
    )
  }
  const room = rooms.rooms.find((r) => r.id === chosen) ?? rooms.rooms[0]
  const asleep = Math.max(0, rooms.total - rooms.rooms.length)

  return (
    <Sheet title={t('arena.rooms.title')} onClose={onClose} t={t} wide>
      <div className="arena-rooms stack gap-3">
        <div className="arena-room-tabs" role="tablist" aria-label={t('arena.rooms.title')}>
          {rooms.rooms.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              className="arena-room-tab"
              aria-selected={r.id === room.id}
              data-restored={r.restored}
              disabled={asking !== null || result !== null}
              onClick={() => setChosen(r.id)}
            >
              <span aria-hidden="true">{r.icon}</span> {pick(r.name, locale)}
              {r.restored && ' ✓'}
            </button>
          ))}
          {Array.from({ length: asleep }, (_, i) => (
            <span key={i} className="arena-room-tab" data-asleep="true">
              🔒 {t('arena.rooms.asleep')}
            </span>
          ))}
        </div>

        {result ? (
          <section className="arena-turn" data-right={result.right}>
            <p className="arena-turn-verdict">{result.right ? t('arena.rooms.right') : t('arena.rooms.wrong')}</p>
            <p className="arena-word-told">
              <strong>{result.word}</strong> <span className="arena-ipa">/{result.ipa}/</span>
              {canSpeak() && (
                <button type="button" className="arena-speak" onClick={() => speak(result.word)} aria-label={t('arena.listen')}>
                  🔊
                </button>
              )}
              <span className="arena-muted"> — {result.meaning}</span>
            </p>
            {result.right && <p className="arena-muted">{t('arena.rooms.inVocab')}</p>}
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onBack}>
              {t('arena.rooms.back')}
            </button>
          </section>
        ) : asking ? (
          <section className="stack gap-2">
            <QuestionBody q={asking} t={t} busy={busy} onAnswer={onAnswer}>
              <p className="arena-muted arena-question-ask">{t(`arena.rooms.ask.${asking.kind}`)}</p>
            </QuestionBody>
            <button type="button" className="arena-link-btn" disabled={busy} onClick={onBack}>
              {t('arena.rooms.later')}
            </button>
          </section>
        ) : (
          <>
            <p className="arena-muted">
              {room.restored ? t('arena.rooms.awake', pick(room.lexi, locale)) : t('arena.rooms.hint')}
            </p>
            {room.bundles.map((b) => {
              const filled = b.words.filter((w) => w.filled).length
              return (
                <section key={b.id} className="arena-bundle" data-testid={`bundle-${b.id}`} data-full={b.full}>
                  <header className="arena-bundle-head">
                    <strong>{pick(b.name, locale)}</strong>
                    <span className="arena-muted">{t('arena.rooms.progress', filled, b.words.length)}</span>
                  </header>
                  <div className="arena-places">
                    {b.words.map((w) =>
                      w.filled ? (
                        <span key={w.key} className="arena-place" data-filled="true">
                          <strong>{w.word}</strong>
                          <span className="arena-ipa">/{w.ipa}/</span>
                          <span className="arena-muted">{w.vi}</span>
                        </span>
                      ) : (
                        <button
                          key={w.key}
                          type="button"
                          className="arena-place"
                          data-place={w.key}
                          disabled={busy || w.triedToday}
                          onClick={() => onAsk(w.key)}
                        >
                          <span>{w.vi}</span>
                          {w.triedToday && <span className="arena-muted">{t('arena.rooms.tomorrow')}</span>}
                        </button>
                      ),
                    )}
                  </div>
                  <footer className="arena-bundle-foot">
                    {b.claimed ? (
                      <span className="arena-muted">✓ {t('arena.rooms.collected')}</span>
                    ) : (
                      <>
                        <RewardChips reward={b.reward} state={state} locale={locale} t={t} />
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy || !b.full}
                          onClick={() => onClaim(b.id)}
                        >
                          {t('arena.rooms.collect')}
                        </button>
                      </>
                    )}
                  </footer>
                </section>
              )
            })}
            {!room.restored && (
              <p className="arena-muted">
                {t('arena.rooms.roomReward')} <RewardChips reward={room.reward} state={state} locale={locale} t={t} />
              </p>
            )}
            {asleep > 0 && <p className="arena-muted">{t('arena.rooms.upstairs', asleep)}</p>}
          </>
        )}
      </div>
    </Sheet>
  )
}
