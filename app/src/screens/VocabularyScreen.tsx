import { useEffect, useState } from 'react'
import { dueDeck, daysUntil, nextDue } from '../lib/flashcards'
import { useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import type { MessageKey } from '../i18n/en'
import { Icon } from '../components/Icon'
import type { VocabStatus } from '../data/types'
import { meaningOrWait } from '../lib/text'
import { useApp } from '../store/context'

/** Labels as keys: the filters are defined at module scope, where the language
 *  is not known yet. */
const FILTERS: { label: MessageKey; value: 'All' | VocabStatus }[] = [
  { label: 'vocab.all', value: 'All' },
  { label: 'vocab.new', value: 'new' },
  { label: 'vocab.learning', value: 'learning' },
  { label: 'vocab.known', value: 'known' },
]

const STATUS_TAG: Record<VocabStatus, string> = {
  known: 'tag tag-accent-2',
  learning: 'tag tag-accent',
  new: 'tag tag-neutral',
}

const STATUS_LABEL: Record<VocabStatus, MessageKey> = {
  known: 'vocab.known',
  learning: 'vocab.learning',
  new: 'vocab.new',
}

export function VocabularyScreen() {
  const { data, setVocabStatus, ensureClips } = useApp()
  const navigate = useNavigate()
  const t = useT()
  const [filter, setFilter] = useState<'All' | VocabStatus>('All')

  const words = data.vocab.filter((word) => filter === 'All' || word.status === filter)

  // Each card can name the clip its word was tapped in, so the clips the shown
  // cards point at are fetched — the handful of them, not the library.
  const clipIds = [...new Set(words.map((word) => word.videoId).filter((id) => id !== null))].join(',')
  useEffect(() => {
    if (clipIds) void ensureClips(clipIds.split(','))
  }, [clipIds, ensureClips])

  // What the schedule has to say today. The deck is what is due; everything
  // else has a date on it, and the screen says which rather than offering a
  // button that leads to an empty session.
  // One clock for the whole screen: the count in the button, the sentence
  // under it and the date on every card should all agree about what "today"
  // is, even if the render happens to straddle midnight.
  const now = new Date()
  const due = dueDeck(data.vocab, now)
  const next = nextDue(data.vocab, now)

  return (
    <div className="stack gap-6">
      <div className="row between wrap gap-2">
        <h1 style={{ margin: 0 }}>{t('vocab.title')}</h1>
        {due.length > 0 ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/vocabulary/practice')}
          >
            <Icon name="brain" size={15} />
            {t('vocab.due', due.length)}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={data.vocab.length === 0}
            onClick={() => navigate('/vocabulary/practice?all=1')}
          >
            <Icon name="brain" size={15} />
            {t('vocab.practiseAnyway')}
          </button>
        )}
      </div>

      {/* Saying nothing is due is the schedule working, not the app being
          empty — so it says when the next word comes round, and leaves the
          door open for anybody who wants to practise anyway. */}
      {data.vocab.length > 0 && due.length === 0 && (
        <div className="card-meta">
          {t('vocab.nothingDue')}
          {next && ` ${t('vocab.nextDue', daysUntil(next))}`}
        </div>
      )}

      <div className="row gap-2 wrap">
        {FILTERS.map((option) => (
          <button
            type="button"
            key={option.value}
            className={`btn ${filter === option.value ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(option.value)}
          >
            {t(option.label)}
          </button>
        ))}
      </div>

      {words.length === 0 && (
        <div className="card-meta">{t('vocab.noWords')}</div>
      )}

      <div className="grid-vocab">
        {words.map((word) => {
          const video = data.videos.find((v) => v.id === word.videoId)
          const known = word.status === 'known'
          return (
            <div className="card elev-sm" key={word.id}>
              <div className="row between gap-2">
                <div className="card-title">{word.word}</div>
                <span className={STATUS_TAG[word.status]}>{t(STATUS_LABEL[word.status])}</span>
              </div>
              <div className="row between gap-2">
                <span className="mono" style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
                  {word.ipa}
                </span>
                {/* When this card comes round again. A learner who marks a
                    word known should be able to see that the app heard them. */}
                <span className="card-meta" style={{ fontSize: 13 }}>
                  {Date.parse(word.dueAt) <= now.getTime()
                    ? t('vocab.dueNow')
                    : t('vocab.dueIn', daysUntil(new Date(word.dueAt), now))}
                </span>
              </div>
              <div className="card-body" style={{ opacity: word.meaning ? 1 : 0.6 }}>
                {meaningOrWait(word.meaning)}
              </div>
              {video && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{
                    paddingInline: 0,
                    justifyContent: 'flex-start',
                    fontSize: 14,
                    textAlign: 'left',
                    whiteSpace: 'normal',
                    height: 'auto',
                  }}
                  onClick={() => navigate(`/library/${video.id}`)}
                >
                  from “{video.title}”
                </button>
              )}
              <button
                type="button"
                className={`btn ${known ? 'btn-secondary' : 'btn-ghost'} btn-block`}
                style={{ marginTop: 2 }}
                onClick={() => void setVocabStatus(word.id, known ? 'learning' : 'known')}
              >
                <Icon name={known ? 'check-circle' : 'circle'} size={14} />
                {known ? t('vocab.learned') : t('vocab.markLearned')}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
