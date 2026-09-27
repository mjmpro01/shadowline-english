import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { EXAMPLES } from '../data/seed'
import { dueDeck, summarise, wholeDeck } from '../lib/flashcards'
import { meaningOrWait } from '../lib/text'
import { useApp } from '../store/context'

export function FlashcardsScreen() {
  const { data, reviewWord } = useApp()
  const navigate = useNavigate()
  const t = useT()
  // `?all` is the learner asking for more than the schedule offers. In the URL
  // rather than in state so the screen has one source for which deck it is.
  const [params] = useSearchParams()
  const all = params.has('all')

  // Fixed when the session starts: answering a card must not reshuffle the
  // rest, and a card whose schedule just moved must not vanish mid-session.
  const [deck, setDeck] = useState(() => (all ? wholeDeck(data.vocab) : dueDeck(data.vocab)))
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [saidAloud, setSaidAloud] = useState(false)
  const [results, setResults] = useState<Record<string, 'known' | 'learning'>>({})
  // A card can come back once in a session and no more. Twice would be a loop
  // for anybody having a bad day with one word.
  const [requeued, setRequeued] = useState<Set<string>>(() => new Set())

  if (!deck.length) return <Navigate to="/vocabulary" replace />

  const card = deck[index]
  const done = index >= deck.length
  const progress = summarise(results, deck.length)

  const answer = (status: 'known' | 'learning') => {
    void reviewWord(card.id, status)
    setResults((prev) => ({ ...prev, [card.id]: status }))
    // A word you have just forgotten is worth seeing again before you leave,
    // which is the one thing a fixed deck cannot do by itself.
    if (status === 'learning' && !requeued.has(card.id)) {
      setRequeued((prev) => new Set(prev).add(card.id))
      setDeck((prev) => [...prev, card])
    }
    setIndex((i) => i + 1)
    setRevealed(false)
    setSaidAloud(false)
  }

  const restart = () => {
    setIndex(0)
    setRevealed(false)
    setSaidAloud(false)
    setResults({})
  }

  return (
    <div className="stack gap-6" style={{ maxWidth: 380, margin: '0 auto', alignItems: 'center', textAlign: 'center' }}>
      <div className="row between" style={{ width: '100%' }}>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/vocabulary')}>
          <Icon name="chevron-left" />
          {t('vocab.title')}
        </button>
        <span className="tag tag-neutral mono">
          {t('cards.progress', done ? deck.length : index + 1, deck.length)}
        </span>
      </div>

      {done ? (
        <div className="card elev-md" style={{ width: '100%', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ color: 'var(--score-good)' }}>
            <Icon name="check-circle" size={36} />
          </span>
          <div className="card-title">{t('cards.summary', progress.reviewed, progress.known)}</div>
          <div className="card-meta">{t('cards.scheduled')}</div>
          <button type="button" className="btn btn-primary btn-block" onClick={restart}>
            {t('cards.again')}
          </button>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => navigate('/vocabulary')}>
            {t('cards.done')}
          </button>
        </div>
      ) : (
        <>
          <div
            className="card elev-md"
            style={{ width: '100%', gap: 'var(--space-3)', minHeight: 220, justifyContent: 'center', alignItems: 'center' }}
          >
            <h2 style={{ fontSize: 28, margin: 0 }}>{card.word}</h2>
            <div className="mono" style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
              {card.ipa}
            </div>

            {revealed ? (
              <>
                <div
                  className="card-body"
                  style={{ textAlign: 'center', opacity: card.meaning ? 1 : 0.6 }}
                >
                  {meaningOrWait(card.meaning)}
                </div>
                <div className="divider" style={{ width: '100%' }} />
                <div style={{ fontSize: 14, fontStyle: 'italic' }}>
                  “{EXAMPLES[card.word] ?? t('cards.trySentence', card.word)}”
                </div>
                <button
                  type="button"
                  className={`btn ${saidAloud ? 'btn-secondary' : 'btn-ghost'}`}
                  onClick={() => setSaidAloud((v) => !v)}
                >
                  <Icon name={saidAloud ? 'check-circle' : 'mic'} size={14} />
                  {saidAloud ? t('cards.saidAloud') : t('cards.sayAloud')}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => setRevealed(true)}>
                {t('cards.reveal')}
              </button>
            )}
          </div>

          {revealed && (
            <div className="row gap-2" style={{ width: '100%' }}>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => answer('learning')}>
                {t('cards.stillLearning')}
              </button>
              <button type="button" className="btn btn-primary btn-block" onClick={() => answer('known')}>
                {t('cards.gotIt')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
