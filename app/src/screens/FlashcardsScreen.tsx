import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { EXAMPLES } from '../data/seed'
import { buildDeck, summarise } from '../lib/flashcards'
import { meaningOrWait } from '../lib/text'
import { useApp } from '../store/context'

export function FlashcardsScreen() {
  const { data, reviewWord } = useApp()
  const navigate = useNavigate()
  const t = useT()

  // Fixed when the session starts: answering a card must not reshuffle the rest.
  const [deck] = useState(() => buildDeck(data.vocab))
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [saidAloud, setSaidAloud] = useState(false)
  const [results, setResults] = useState<Record<string, 'known' | 'learning'>>({})

  if (!deck.length) return <Navigate to="/vocabulary" replace />

  const card = deck[index]
  const done = index >= deck.length
  const progress = summarise(results, deck.length)

  const answer = (status: 'known' | 'learning') => {
    void reviewWord(card.id, status)
    setResults((prev) => ({ ...prev, [card.id]: status }))
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
          Vocabulary
        </button>
        <span className="tag tag-neutral mono">
          {done ? `${deck.length} of ${deck.length}` : `${index + 1} of ${deck.length}`}
        </span>
      </div>

      {done ? (
        <div className="card elev-md" style={{ width: '100%', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ color: 'var(--score-good)' }}>
            <Icon name="check-circle" size={36} />
          </span>
          <div className="card-title">
            Reviewed {progress.reviewed} {progress.reviewed === 1 ? 'word' : 'words'} — {progress.known} marked known
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={restart}>
            Practice again
          </button>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => navigate('/vocabulary')}>
            Back to Vocabulary
          </button>
        </div>
      ) : (
        <>
          <div
            className="card elev-md"
            style={{ width: '100%', gap: 'var(--space-3)', minHeight: 220, justifyContent: 'center', alignItems: 'center' }}
          >
            <h2 style={{ fontSize: 28, margin: 0 }}>{card.word}</h2>
            <div className="mono" style={{ fontSize: 13, opacity: 0.6 }}>
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
                  “{EXAMPLES[card.word] ?? `Try using "${card.word}" in a sentence of your own.`}”
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
                Reveal meaning
              </button>
            )}
          </div>

          {revealed && (
            <div className="row gap-2" style={{ width: '100%' }}>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => answer('learning')}>
                Still learning
              </button>
              <button type="button" className="btn btn-primary btn-block" onClick={() => answer('known')}>
                Got it
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
