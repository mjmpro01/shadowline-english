import { useState } from 'react'
import { useT } from '../i18n'
import { explain } from '../lib/errors'
import { repository, type PhraseInput, type PhrasebookEntry } from '../repository'

/**
 * A row of the phrasebook being written: the situation and the phrase on one
 * side, when it is said and how it feels on the other. New when there is no
 * entry to edit.
 */
export function PhraseForm({
  start,
  entry,
  onSaved,
  onCancel,
}: {
  start: PhraseInput
  entry?: PhrasebookEntry
  onSaved: (saved: PhrasebookEntry) => void
  onCancel: () => void
}) {
  const t = useT()
  const [situation, setSituation] = useState(start.situation)
  const [phrase, setPhrase] = useState(start.phrase)
  const [note, setNote] = useState(start.note)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const input = { dialogueId: start.dialogueId ?? null, situation, phrase, note }
    try {
      onSaved(entry ? await repository.updatePhrase(entry.id, input) : await repository.addPhrase(input))
    } catch (err) {
      setError(explain(err, t, t('common.loadFailed')))
      setSaving(false)
    }
  }

  return (
    <form className="phrase-form" onSubmit={save}>
      <label className="stack" style={{ gap: 4 }}>
        <span className="card-kicker">{t('phrasebook.situation')}</span>
        <input className="input" value={situation} onChange={(e) => setSituation(e.target.value)} />
      </label>
      <label className="stack" style={{ gap: 4 }}>
        <span className="card-kicker">{t('phrasebook.phrase')}</span>
        <input className="input" value={phrase} required onChange={(e) => setPhrase(e.target.value)} />
      </label>
      <label className="stack phrase-form-note" style={{ gap: 4 }}>
        <span className="card-kicker">{t('phrasebook.note')}</span>
        <textarea
          className="input dict-box"
          rows={3}
          value={note}
          placeholder={t('phrasebook.notePlaceholder')}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {error && <div className="card-meta" role="alert">{error}</div>}
      <div className="row gap-2">
        <button type="submit" className="btn btn-primary" disabled={saving || phrase.trim() === ''}>
          {t('phrasebook.save')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t('phrasebook.cancel')}
        </button>
      </div>
    </form>
  )
}
