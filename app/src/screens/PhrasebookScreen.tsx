import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Loading } from '../components/LoadState'
import { PhraseForm } from '../components/PhraseForm'
import { explain } from '../lib/errors'
import { useRemote } from '../lib/remote'
import { canSpeak, speak } from '../lib/speak'
import { repository, type PhrasebookEntry } from '../repository'

const NEW = { situation: '', phrase: '', note: '' }

/** Whether a row has a query in it, on either side. */
function matches(entry: PhrasebookEntry, query: string): boolean {
  const q = query.trim().toLowerCase()
  return q === '' || [entry.situation, entry.phrase, entry.note].some((text) => text.toLowerCase().includes(q))
}

/**
 * The learner's phrasebook, in two columns: the situation and the phrase as it
 * is said, and when they would say it and how it feels. On a phone the two
 * sides of a row stack.
 */
export function PhrasebookScreen() {
  const t = useT()
  const remote = useRemote('', () => repository.phrasebook())
  const [entries, setEntries] = useState<PhrasebookEntry[] | null>(null)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState('')
  const voices = canSpeak()

  useEffect(() => {
    if (remote.state === 'ready') setEntries(remote.value)
  }, [remote])

  const remove = async (entry: PhrasebookEntry) => {
    if (!window.confirm(t('phrasebook.confirmDelete', entry.phrase))) return
    try {
      await repository.deletePhrase(entry.id)
      setEntries((all) => all?.filter((e) => e.id !== entry.id) ?? null)
    } catch (err) {
      setError(explain(err, t, t('common.loadFailed')))
    }
  }

  const shown = entries?.filter((e) => matches(e, query)) ?? []

  return (
    <div className="stack gap-6">
      <Link to="/dialogues" className="link-button row gap-1" style={{ alignSelf: 'flex-start' }}>
        <Icon name="chevron-left" size={16} />
        {t('dialogue.back')}
      </Link>
      <div className="stack" style={{ gap: 4 }}>
        <h1 style={{ margin: 0 }}>{t('phrasebook.title')}</h1>
        <div className="card-meta">{t('phrasebook.intro')}</div>
      </div>

      {remote.state === 'error' ? (
        <div className="card-meta">{remote.message}</div>
      ) : entries === null ? (
        <Loading />
      ) : (
        <>
          <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
            <input
              type="search"
              className="input"
              style={{ flex: '1 1 220px' }}
              placeholder={t('phrasebook.search')}
              aria-label={t('phrasebook.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)} disabled={adding}>
              <Icon name="plus" size={16} />
              {t('phrasebook.add')}
            </button>
          </div>
          {adding && (
            <div className="card elev-sm">
              <PhraseForm
                start={NEW}
                onSaved={(saved) => {
                  setEntries((all) => [saved, ...(all ?? [])])
                  setAdding(false)
                }}
                onCancel={() => setAdding(false)}
              />
            </div>
          )}
          {error && (
            <div className="card-meta" role="alert">
              {error}
            </div>
          )}

          {entries.length === 0 ? (
            <div className="card-meta">{t('phrasebook.empty')}</div>
          ) : shown.length === 0 ? (
            <div className="card-meta">{t('phrasebook.nothingFound', query.trim())}</div>
          ) : (
            <div className="phrasebook" role="table" aria-label={t('phrasebook.title')}>
              <div className="phrasebook-head" role="row">
                <span role="columnheader">{t('phrasebook.colPhrase')}</span>
                <span role="columnheader">{t('phrasebook.colNote')}</span>
                <span className="card-meta">{t('phrasebook.count', entries.length)}</span>
              </div>
              {shown.map((entry) =>
                editing === entry.id ? (
                  <div key={entry.id} className="phrasebook-row" role="row" data-editing="true">
                    <PhraseForm
                      start={entry}
                      entry={entry}
                      onSaved={(saved) => {
                        setEntries((all) => all?.map((e) => (e.id === saved.id ? saved : e)) ?? null)
                        setEditing(null)
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                ) : (
                  <div key={entry.id} className="phrasebook-row" role="row" data-testid="phrasebook-row">
                    <div className="stack" style={{ gap: 2 }} role="cell">
                      {entry.situation && <span className="card-kicker">{entry.situation}</span>}
                      <span className="row gap-1" style={{ alignItems: 'baseline' }}>
                        <strong className="dialogue-phrase">{entry.phrase}</strong>
                        {voices && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            title={t('dialogue.listen')}
                            aria-label={t('dialogue.listen')}
                            onClick={() => speak(entry.phrase.replace(/…/g, ''))}
                          >
                            <Icon name="volume" size={14} />
                          </button>
                        )}
                      </span>
                    </div>
                    <div role="cell" className={entry.note ? undefined : 'card-meta'}>
                      {entry.note || t('phrasebook.noNote')}
                    </div>
                    <div className="row gap-1 phrasebook-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => setEditing(entry.id)}>
                        <Icon name="square-pen" size={14} />
                        {t('phrasebook.edit')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        title={t('phrasebook.delete')}
                        aria-label={t('phrasebook.delete')}
                        onClick={() => void remove(entry)}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
