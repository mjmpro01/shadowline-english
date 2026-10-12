import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useT } from '../i18n'
import { ConfirmDelete } from '../components/ConfirmDelete'
import { Icon } from '../components/Icon'
import { Loading } from '../components/LoadState'
import { SavedField } from '../components/SavedField'
import type { Playlist, Section } from '../data/types'
import { ApiError } from '../lib/api'
import { repository } from '../repository'

/**
 * The shelves of the learner's library: "For children", "Films", "Anime".
 *
 * A shelf is a choice of series in an order, made here and nowhere else — a
 * series can stand on several, and one on none is still in the library's list
 * of every series. A shelf with nothing on it is not shown to learners, so one
 * can be made and filled before anybody sees it.
 */
export function Shelves() {
  const t = useT()
  const [shelves, setShelves] = useState<Section[] | null>(null)
  const [series, setSeries] = useState<Playlist[]>([])
  const [error, setError] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Section | null>(null)

  const reload = useCallback(async () => {
    try {
      const [listed, all] = await Promise.all([repository.sections(), repository.listPlaylists()])
      setShelves(listed)
      setSeries(all)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('shelves.loadFailed'))
    }
  }, [t])

  useEffect(() => {
    // Every setState inside reload() runs after an await, so none of them
    // happens during this effect — the rule cannot see through the async
    // boundary.
    // eslint-disable-next-line react/set-state-in-effect
    void reload()
  }, [reload])

  /** Runs a change and reloads, and says so on the page when it fails. */
  const change = async (work: () => Promise<unknown>) => {
    setProblem(null)
    try {
      await work()
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t('shelves.saveFailed'))
    }
    await reload()
  }

  /** Swaps a shelf with its neighbour by writing both their places. The list
   *  is renumbered as it goes, so shelves that were made with the same
   *  position still move one step at a time. */
  const move = (index: number, by: -1 | 1) => {
    if (!shelves) return
    const other = index + by
    if (other < 0 || other >= shelves.length) return
    void change(() =>
      Promise.all([
        repository.updateSection(shelves[index].id, { position: other }),
        repository.updateSection(shelves[other].id, { position: index }),
        ...shelves
          .map((shelf, i) => ({ shelf, i }))
          .filter(({ shelf, i }) => i !== index && i !== other && shelf.position !== i)
          .map(({ shelf, i }) => repository.updateSection(shelf.id, { position: i })),
      ]),
    )
  }

  if (error !== null) return <div className="card-meta">{error}</div>
  if (shelves === null) return <Loading />

  return (
    <div className="stack gap-3">
      <div>
        <h1 style={{ marginBottom: 2 }}>{t('shelves.title')}</h1>
        <div className="card-meta">{t('shelves.lede')}</div>
      </div>

      <NewShelf onMade={(input) => change(() => repository.createSection(input))} />

      {problem !== null && (
        <div className="card-meta" role="alert">
          {problem}
        </div>
      )}

      {deleting && (
        <ConfirmDelete
          title={t('shelves.deleteTitle')}
          body={t('shelves.deleteBody', deleting.title)}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const id = deleting.id
            setDeleting(null)
            void change(() => repository.deleteSection(id))
          }}
        />
      )}

      {shelves.length === 0 && <div className="card-meta">{t('shelves.none')}</div>}

      {shelves.map((shelf, index) => (
        <div className="card elev-sm stack gap-2" key={shelf.id}>
          <div className="row between wrap gap-2">
            <span className="row gap-2" style={{ alignItems: 'center' }}>
              <span style={{ fontSize: 22 }} aria-hidden="true">
                {shelf.icon || '📚'}
              </span>
              <strong>{shelf.title}</strong>
              <span className="card-meta mono">
                {`/library/shelf/${shelf.slug} · `}
                {shelf.series === 0 ? t('shelves.hidden') : t('shelves.count', shelf.series)}
              </span>
            </span>
            <div className="row gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={index === 0}
                aria-label={t('shelves.moveUp', shelf.title)}
                onClick={() => move(index, -1)}
              >
                <Icon name="chevron-up" />
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={index === shelves.length - 1}
                aria-label={t('shelves.moveDown', shelf.title)}
                onClick={() => move(index, 1)}
              >
                <Icon name="chevron-down" />
              </button>
              <button type="button" className="btn btn-danger" onClick={() => setDeleting(shelf)}>
                {t('shelves.delete')}
              </button>
            </div>
          </div>

          <div className="row gap-3 wrap">
            <SavedField
              id={`shelf-name-${shelf.id}`}
              label={t('shelves.name')}
              value={shelf.title}
              style={{ flex: '1 1 220px' }}
              onSave={(title) => {
                if (title.trim() === '') return
                void change(() => repository.updateSection(shelf.id, { title }))
              }}
            />
            <SavedField
              id={`shelf-icon-${shelf.id}`}
              label={t('shelves.icon')}
              value={shelf.icon}
              style={{ flex: '0 0 110px' }}
              onSave={(icon) => void change(() => repository.updateSection(shelf.id, { icon }))}
            />
          </div>
          <SavedField
            id={`shelf-about-${shelf.id}`}
            label={t('shelves.about')}
            value={shelf.description}
            onSave={(description) => void change(() => repository.updateSection(shelf.id, { description }))}
          />

          <OnShelf
            shelf={shelf}
            series={series}
            onSet={(ids) => change(() => repository.setSectionSeries(shelf.id, ids))}
          />
        </div>
      ))}
    </div>
  )
}

function NewShelf({ onMade }: { onMade: (input: { title: string; icon: string }) => Promise<void> }) {
  const t = useT()
  const [title, setTitle] = useState('')
  const [icon, setIcon] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (title.trim() === '') return
    setBusy(true)
    await onMade({ title: title.trim(), icon: icon.trim() })
    setBusy(false)
    setTitle('')
    setIcon('')
  }

  return (
    <form className="card elev-sm row gap-3 wrap" style={{ alignItems: 'flex-end' }} onSubmit={(e) => void submit(e)}>
      <div className="field" style={{ flex: '1 1 220px' }}>
        <label htmlFor="new-shelf-title">{t('shelves.newName')}</label>
        <input
          id="new-shelf-title"
          className="input"
          value={title}
          maxLength={60}
          placeholder={t('shelves.newNameHint')}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="field" style={{ flex: '0 0 110px' }}>
        <label htmlFor="new-shelf-icon">{t('shelves.icon')}</label>
        <input
          id="new-shelf-icon"
          className="input"
          value={icon}
          placeholder="🎬"
          onChange={(e) => setIcon(e.target.value)}
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy || title.trim() === ''}>
        {t('shelves.add')}
      </button>
    </form>
  )
}

/**
 * The series on one shelf, in order, with the controls to rearrange them.
 * Every change sends the whole list: the server replaces the shelf with it, so
 * there is no order of requests that can leave it half moved.
 */
function OnShelf({
  shelf,
  series,
  onSet,
}: {
  shelf: Section
  series: Playlist[]
  onSet: (ids: string[]) => Promise<void>
}) {
  const t = useT()
  const [adding, setAdding] = useState('')
  const byId = new Map(series.map((p) => [p.id, p]))
  const ids = shelf.playlistIds
  const off = series.filter((p) => !ids.includes(p.id))

  const moved = (index: number, by: -1 | 1) => {
    const next = [...ids]
    const other = index + by
    ;[next[index], next[other]] = [next[other], next[index]]
    return next
  }

  return (
    <div className="stack gap-2">
      <span className="card-kicker">{t('shelves.series')}</span>
      {ids.length === 0 && <div className="card-meta">{t('shelves.emptyShelf')}</div>}
      {ids.length > 0 && (
        <ol className="shelf-list">
          {ids.map((id, index) => {
            const playlist = byId.get(id)
            return (
              <li key={id} className="shelf-item">
                <span className="shelf-thumb">
                  {playlist?.coverUrl ? <img src={playlist.coverUrl} alt="" /> : null}
                </span>
                <span className="shelf-name">{playlist?.title ?? id}</span>
                <span className="row gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    disabled={index === 0}
                    aria-label={t('shelves.moveUp', playlist?.title ?? '')}
                    onClick={() => void onSet(moved(index, -1))}
                  >
                    <Icon name="chevron-up" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    disabled={index === ids.length - 1}
                    aria-label={t('shelves.moveDown', playlist?.title ?? '')}
                    onClick={() => void onSet(moved(index, 1))}
                  >
                    <Icon name="chevron-down" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label={t('shelves.takeOff', playlist?.title ?? '')}
                    onClick={() => void onSet(ids.filter((other) => other !== id))}
                  >
                    <Icon name="x" />
                  </button>
                </span>
              </li>
            )
          })}
        </ol>
      )}
      {off.length > 0 && (
        <div className="row gap-2 wrap">
          <select
            className="input"
            style={{ flex: '1 1 220px' }}
            value={adding}
            aria-label={t('shelves.pick')}
            onChange={(e) => setAdding(e.target.value)}
          >
            <option value="">{t('shelves.pick')}</option>
            {off.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={adding === ''}
            onClick={() => {
              const id = adding
              setAdding('')
              void onSet([...ids, id])
            }}
          >
            {t('shelves.putOn')}
          </button>
        </div>
      )}
    </div>
  )
}
