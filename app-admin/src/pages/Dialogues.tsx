import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ConfirmDelete } from '../components/ConfirmDelete'
import { Icon } from '../components/Icon'
import { Loading } from '../components/LoadState'
import { useT } from '../i18n'
import { ApiError } from '../lib/api'
import {
  DIALOGUE_LEVELS,
  repository,
  type Dialogue,
  type DialogueInput,
  type DialogueLevel,
  type DialogueLine,
} from '../repository'

const EMPTY: DialogueInput = {
  title: '',
  situation: '',
  topic: '',
  level: 'A2',
  lines: [
    { speaker: 'A', name: '', text: '', vi: '' },
    { speaker: 'B', name: 'You', text: '', vi: '' },
  ],
  phrases: [],
  published: false,
  position: 0,
}

function inputOf(dialogue: Dialogue): DialogueInput {
  const { id: _id, slug: _slug, createdAt: _created, updatedAt: _updated, ...input } = dialogue
  return input
}

/** Moves one item of a list a place up or down. */
function moved<T>(list: T[], from: number, by: -1 | 1): T[] {
  const to = from + by
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

/**
 * Dialogues for learners to read aloud: written here, or drafted by the tutor
 * and edited here, and published when ready.
 */
export function Dialogues() {
  const t = useT()
  const [dialogues, setDialogues] = useState<Dialogue[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Dialogue | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Dialogue | null>(null)

  const load = useCallback(async () => {
    try {
      setDialogues(await repository.dialogues())
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the dialogues.')
    }
  }, [])

  useEffect(() => {
    // Every setState inside load() runs after an await.
    // eslint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  const replace = (next: Dialogue) =>
    setDialogues((current) => {
      if (!current) return [next]
      return current.some((d) => d.id === next.id)
        ? current.map((d) => (d.id === next.id ? next : d))
        : [...current, next]
    })

  const togglePublished = async (dialogue: Dialogue) => {
    try {
      replace(await repository.updateDialogue(dialogue.id, { ...inputOf(dialogue), published: !dialogue.published }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change that.')
    }
  }

  const remove = async (dialogue: Dialogue) => {
    setDeleting(null)
    try {
      await repository.deleteDialogue(dialogue.id)
      setDialogues((current) => current?.filter((d) => d.id !== dialogue.id) ?? null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete that.')
    }
  }

  if (editing !== null) {
    return (
      <DialogueEditor
        dialogue={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          replace(saved)
          setEditing(null)
        }}
      />
    )
  }

  return (
    <div className="stack gap-3">
      <div className="row between wrap gap-2">
        <div>
          <h1 style={{ marginBottom: 2 }}>{t('dialogues.title')}</h1>
          <div className="card-meta">{t('dialogues.subtitle')}</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          {t('dialogues.new')}
        </button>
      </div>

      {error !== null && (
        <div className="card-meta" role="alert">
          {error}
        </div>
      )}
      {dialogues === null && error === null && <Loading />}
      {dialogues !== null && dialogues.length === 0 && <div className="card-meta">{t('dialogues.none')}</div>}

      {dialogues?.map((dialogue) => (
        <div className="card elev-sm row gap-3 banner-row" key={dialogue.id}>
          <div className="stack gap-1" style={{ flex: 1, minWidth: 0 }}>
            <div className="row gap-1 wrap">
              <span className="card-title">{dialogue.title}</span>
              <span className={dialogue.published ? 'tag tag-good' : 'tag tag-outline'}>
                {dialogue.published ? t('dialogues.published') : t('dialogues.draft')}
              </span>
            </div>
            {dialogue.situation && <div className="card-meta">{dialogue.situation}</div>}
            <div className="card-meta mono">
              {dialogue.level}
              {dialogue.topic && ` · ${dialogue.topic}`}
              {` · ${t('dialogues.lines', dialogue.lines.length)}`}
              {` · /dialogues/${dialogue.slug}`}
            </div>
          </div>
          <div className="row gap-1">
            <button type="button" className="btn btn-secondary" onClick={() => void togglePublished(dialogue)}>
              {dialogue.published ? t('dialogues.unpublish') : t('dialogues.publish')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(dialogue)}>
              {t('dialogues.edit')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setDeleting(dialogue)}>
              {t('common.delete')}
            </button>
          </div>
        </div>
      ))}

      {deleting !== null && (
        <ConfirmDelete
          title={t('dialogues.deleteTitle')}
          body={t('dialogues.deleteBody', deleting.title)}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void remove(deleting)}
        />
      )}
    </div>
  )
}

/**
 * A dialogue being written, on a page of its own rather than in a dialog: two
 * columns of lines want the width.
 */
function DialogueEditor({
  dialogue,
  onClose,
  onSaved,
}: {
  dialogue: Dialogue | null
  onClose: () => void
  onSaved: (dialogue: Dialogue) => void
}) {
  const t = useT()
  const [input, setInput] = useState<DialogueInput>(() => (dialogue ? inputOf(dialogue) : EMPTY))
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [about, setAbout] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [drafted, setDrafted] = useState(false)

  const set = <K extends keyof DialogueInput>(key: K, value: DialogueInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }))

  const setLine = (i: number, patch: Partial<DialogueLine>) =>
    set(
      'lines',
      input.lines.map((line, j) => (j === i ? { ...line, ...patch } : line)),
    )

  const addLine = () => {
    const last = input.lines[input.lines.length - 1]
    const speaker = last?.speaker === 'A' ? 'B' : 'A'
    // The next line is the other person's, under the name they last had.
    const name = [...input.lines].reverse().find((l) => l.speaker === speaker)?.name ?? ''
    set('lines', [...input.lines, { speaker, name, text: '', vi: '' }])
  }

  const draft = async () => {
    setDrafting(true)
    setProblem(null)
    setDrafted(false)
    try {
      const got = await repository.draftDialogue(about, input.level)
      // What the admin already set about publishing and order stays theirs.
      setInput((current) => ({ ...got, published: current.published, position: current.position }))
      setDrafted(true)
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not write a draft.')
    } finally {
      setDrafting(false)
    }
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setProblem(null)
    try {
      onSaved(dialogue ? await repository.updateDialogue(dialogue.id, input) : await repository.createDialogue(input))
    } catch (err) {
      // The server's own sentence: it is the one place that knows every rule.
      setProblem(err instanceof ApiError ? err.message : 'Could not save the dialogue.')
      setSaving(false)
    }
  }

  return (
    <form className="stack gap-4" onSubmit={(e) => void save(e)} aria-label={dialogue ? t('dialogues.editTitle') : t('dialogues.newTitle')}>
      <div className="row between wrap gap-2">
        <div className="stack gap-1">
          <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={onClose}>
            <Icon name="chevron-left" size={14} />
            {t('dialogues.back')}
          </button>
          <h1 style={{ margin: 0 }}>{dialogue ? t('dialogues.editTitle') : t('dialogues.newTitle')}</h1>
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? t('dialogues.saving') : t('dialogues.save')}
        </button>
      </div>

      {!dialogue && (
        <section className="card elev-sm stack gap-2" aria-labelledby="dialogue-draft">
          <h2 id="dialogue-draft" className="card-kicker" style={{ margin: 0 }}>
            {t('dialogues.draftTitle')}
          </h2>
          <div className="card-meta">{t('dialogues.draftHint')}</div>
          <div className="row gap-2 wrap" style={{ alignItems: 'flex-end' }}>
            <label className="stack gap-1" style={{ flex: '1 1 320px' }}>
              <span className="card-kicker">{t('dialogues.draftSituation')}</span>
              <input
                className="input"
                maxLength={500}
                placeholder="Buying medicine at a pharmacy"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={drafting || about.trim() === ''}
              onClick={() => void draft()}
            >
              {drafting ? t('dialogues.drafting') : t('dialogues.draftButton')}
            </button>
          </div>
          {drafted && (
            <div className="card-meta" role="status">
              {t('dialogues.drafted')}
            </div>
          )}
        </section>
      )}

      {problem !== null && (
        <div className="card-meta" role="alert">
          {problem}
        </div>
      )}

      <div className="row gap-2 wrap">
        <label className="stack gap-1" style={{ flex: '2 1 260px' }}>
          <span className="card-kicker">{t('dialogues.fieldTitle')}</span>
          <input
            className="input"
            required
            maxLength={120}
            value={input.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </label>
        <label className="stack gap-1" style={{ flex: '1 1 140px' }}>
          <span className="card-kicker">{t('dialogues.fieldTopic')}</span>
          <input className="input" maxLength={40} value={input.topic} onChange={(e) => set('topic', e.target.value)} />
        </label>
        <label className="stack gap-1" style={{ flex: '0 1 90px' }}>
          <span className="card-kicker">{t('dialogues.fieldLevel')}</span>
          <select
            className="input"
            value={input.level}
            onChange={(e) => set('level', e.target.value as DialogueLevel)}
          >
            {DIALOGUE_LEVELS.map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
        </label>
        <label className="stack gap-1" style={{ flex: '0 1 90px' }}>
          <span className="card-kicker">{t('dialogues.fieldPosition')}</span>
          <input
            className="input"
            type="number"
            value={input.position}
            onChange={(e) => set('position', Number(e.target.value) || 0)}
          />
        </label>
      </div>
      <label className="stack gap-1">
        <span className="card-kicker">{t('dialogues.fieldSituation')}</span>
        <input
          className="input"
          maxLength={300}
          value={input.situation}
          onChange={(e) => set('situation', e.target.value)}
        />
      </label>

      <section className="stack gap-2" aria-labelledby="dialogue-lines">
        <h2 id="dialogue-lines" className="card-kicker" style={{ margin: 0 }}>
          {t('dialogues.linesTitle')}
        </h2>
        <div className="card-meta">{t('dialogues.linesHint')}</div>
        {input.lines.map((line, i) => (
          <div key={i} className="card elev-sm dialogue-edit-line" data-testid={`edit-line-${i}`}>
            <label className="stack gap-1">
              <span className="card-kicker">{t('dialogues.speaker')}</span>
              <select
                className="input"
                value={line.speaker}
                onChange={(e) => setLine(i, { speaker: e.target.value as 'A' | 'B' })}
              >
                <option>A</option>
                <option>B</option>
              </select>
            </label>
            <label className="stack gap-1">
              <span className="card-kicker">{t('dialogues.name')}</span>
              <input className="input" maxLength={40} value={line.name} onChange={(e) => setLine(i, { name: e.target.value })} />
            </label>
            <label className="stack gap-1 dialogue-edit-text">
              <span className="card-kicker">{t('dialogues.text')}</span>
              <input
                className="input"
                required
                maxLength={300}
                value={line.text}
                onChange={(e) => setLine(i, { text: e.target.value })}
              />
            </label>
            <label className="stack gap-1 dialogue-edit-text">
              <span className="card-kicker">{t('dialogues.vi')}</span>
              <input className="input" maxLength={300} value={line.vi} onChange={(e) => setLine(i, { vi: e.target.value })} />
            </label>
            <div className="row gap-1 dialogue-edit-moves">
              <button
                type="button"
                className="btn btn-ghost"
                title={t('dialogues.up')}
                aria-label={t('dialogues.up')}
                disabled={i === 0}
                onClick={() => set('lines', moved(input.lines, i, -1))}
              >
                <Icon name="chevron-up" size={14} />
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                title={t('dialogues.down')}
                aria-label={t('dialogues.down')}
                disabled={i === input.lines.length - 1}
                onClick={() => set('lines', moved(input.lines, i, 1))}
              >
                <Icon name="chevron-down" size={14} />
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                title={t('dialogues.remove')}
                aria-label={t('dialogues.remove')}
                disabled={input.lines.length <= 2}
                onClick={() => set('lines', input.lines.filter((_, j) => j !== i))}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={addLine}>
          {t('dialogues.addLine')}
        </button>
      </section>

      <section className="stack gap-2" aria-labelledby="dialogue-phrases">
        <h2 id="dialogue-phrases" className="card-kicker" style={{ margin: 0 }}>
          {t('dialogues.phrasesTitle')}
        </h2>
        {input.phrases.map((phrase, i) => (
          <div key={i} className="row gap-2 wrap" style={{ alignItems: 'flex-end' }} data-testid={`edit-phrase-${i}`}>
            <label className="stack gap-1" style={{ flex: '1 1 220px' }}>
              <span className="card-kicker">{t('dialogues.phrase')}</span>
              <input
                className="input"
                maxLength={300}
                value={phrase.phrase}
                onChange={(e) =>
                  set(
                    'phrases',
                    input.phrases.map((p, j) => (j === i ? { ...p, phrase: e.target.value } : p)),
                  )
                }
              />
            </label>
            <label className="stack gap-1" style={{ flex: '2 1 300px' }}>
              <span className="card-kicker">{t('dialogues.note')}</span>
              <input
                className="input"
                maxLength={1000}
                value={phrase.note}
                onChange={(e) =>
                  set(
                    'phrases',
                    input.phrases.map((p, j) => (j === i ? { ...p, note: e.target.value } : p)),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost"
              title={t('dialogues.remove')}
              aria-label={t('dialogues.remove')}
              onClick={() => set('phrases', input.phrases.filter((_, j) => j !== i))}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => set('phrases', [...input.phrases, { phrase: '', note: '' }])}
        >
          {t('dialogues.addPhrase')}
        </button>
      </section>

      <label className="row gap-2">
        <input type="checkbox" checked={input.published} onChange={(e) => set('published', e.target.checked)} />
        <span>{t('dialogues.fieldPublished')}</span>
      </label>
    </form>
  )
}
