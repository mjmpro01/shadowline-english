import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import type { VocabStatus } from '../data/types'
import { meaningOrWait } from '../lib/text'
import { useApp } from '../store/context'

const FILTERS: { label: string; value: 'All' | VocabStatus }[] = [
  { label: 'All', value: 'All' },
  { label: 'New', value: 'new' },
  { label: 'Learning', value: 'learning' },
  { label: 'Known', value: 'known' },
]

const STATUS_TAG: Record<VocabStatus, string> = {
  known: 'tag tag-accent-2',
  learning: 'tag tag-accent',
  new: 'tag tag-neutral',
}

const STATUS_LABEL: Record<VocabStatus, string> = {
  known: 'Known',
  learning: 'Learning',
  new: 'New',
}

export function VocabularyScreen() {
  const { data, setVocabStatus } = useApp()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'All' | VocabStatus>('All')

  const words = data.vocab.filter((word) => filter === 'All' || word.status === filter)

  return (
    <div className="stack gap-6">
      <div className="row between wrap gap-2">
        <h1 style={{ margin: 0 }}>Vocabulary</h1>
        <button
          type="button"
          className="btn btn-primary"
          disabled={data.vocab.length === 0}
          onClick={() => navigate('/vocabulary/practice')}
        >
          <Icon name="brain" size={15} />
          Memory practice
        </button>
      </div>

      <div className="row gap-2 wrap">
        {FILTERS.map((option) => (
          <button
            type="button"
            key={option.value}
            className={`btn ${filter === option.value ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {words.length === 0 && (
        <div className="card-meta">No words here yet — tap a word while practising to add it.</div>
      )}

      <div className="grid-vocab">
        {words.map((word) => {
          const video = data.videos.find((v) => v.id === word.videoId)
          const known = word.status === 'known'
          return (
            <div className="card elev-sm" key={word.id}>
              <div className="row between gap-2">
                <div className="card-title">{word.word}</div>
                <span className={STATUS_TAG[word.status]}>{STATUS_LABEL[word.status]}</span>
              </div>
              <div className="mono" style={{ fontSize: 13, opacity: 0.6 }}>
                {word.ipa}
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
                    fontSize: 12,
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
                {known ? 'Learned' : 'Mark learned'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
