import { useCallback, useEffect, useState } from 'react'
import { useT } from '../i18n'
import { ConfirmDelete } from '../components/ConfirmDelete'
import { Loading } from '../components/LoadState'
import { SavedField } from '../components/SavedField'
import type { Video } from '../data/types'
import { ApiError } from '../lib/api'
import { formatCategories, parseCategories } from '../lib/clips'
import { useDebounced } from '../lib/remote'
import { clock } from '../lib/time'
import { repository } from '../repository'
import { useApp } from '../store/context'

/** How many clips the manager asks for at once. Mirrors the server's own page
 *  size, which is what actually caps it. */
const PAGE = 50

/**
 * The studio's clip manager.
 *
 * The one screen whose job is the whole library — and it pages through it. It
 * used to filter a list of every clip that the app had been handed at sign-in;
 * that list was 7.4MB against forty series and is gone, so the search runs on
 * the server and the rows arrive fifty at a time.
 */
export function StudioClips({ onCount }: { onCount: (n: number) => void }) {
  const t = useT()
  const { updateClip, deleteClip } = useApp()
  const [query, setQuery] = useState('')
  const settled = useDebounced(query.trim(), 250)
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<{ clips: Video[]; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Video | null>(null)

  const load = useCallback(
    async (at: number) => {
      try {
        const got = await repository.studioClips(settled, PAGE, at)
        setPage(got)
        onCount(got.total)
        setError(null)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load the clips.')
      }
    },
    [settled, onCount],
  )

  // A new search starts at the first page: staying on page four of the last
  // search would show an empty screen and no reason for it.
  useEffect(() => {
    setOffset(0)
  }, [settled])

  useEffect(() => {
    // Every setState inside load() runs after an await, so none of them
    // happens during this effect — the rule cannot see through the async
    // boundary.
    // eslint-disable-next-line react/set-state-in-effect
    void load(offset)
  }, [load, offset])

  const refresh = () => void load(offset)

  return (
    <div className="stack gap-3">
      <input
        className="input"
        placeholder={t('studio.findClip')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t('studio.findClipLabel')}
      />

      {deleting && (
        <ConfirmDelete
          title={t('studio.deleteClipTitle')}
          body={t('studio.deleteClipBody', deleting.title)}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const id = deleting.id
            setDeleting(null)
            void deleteClip(id).then(refresh)
          }}
        />
      )}

      {error !== null && <div className="card-meta">{error}</div>}
      {page === null && error === null && <Loading />}
      {page !== null && page.clips.length === 0 && (
        <div className="card-meta">{settled ? t('studio.noMatch') : t('studio.noClips')}</div>
      )}

      {page?.clips.map((video) => (
        <div className="card elev-sm stack gap-2" key={video.id}>
          <div className="row between wrap gap-2">
            <span className="card-meta mono">
              {video.source} · {video.timestamp} · {clock(video.durationSeconds)}
            </span>
            <div className="row gap-2">
              <button
                type="button"
                className={`btn ${video.featured ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => void updateClip(video.id, { featured: !video.featured }).then(refresh)}
              >
                {video.featured ? t('studio.featured') : t('studio.feature')}
              </button>
              <button type="button" className="btn btn-danger" onClick={() => setDeleting(video)}>
                {t('studio.deleteClip')}
              </button>
            </div>
          </div>
          <div className="row gap-3 wrap">
            <SavedField
              id={`name-${video.id}`}
              label={t('studio.clipName')}
              value={video.title}
              style={{ flex: '1 1 220px' }}
              onSave={(title) => void updateClip(video.id, { title }).then(refresh)}
            />
            <SavedField
              id={`playlist-${video.id}`}
              label={t('studio.playlist')}
              value={video.playlist}
              style={{ flex: '1 1 160px' }}
              onSave={(playlist) => void updateClip(video.id, { playlist }).then(refresh)}
            />
            <SavedField
              id={`cats-${video.id}`}
              label={t('studio.categories')}
              value={formatCategories(video.categories)}
              style={{ flex: '1 1 160px' }}
              onSave={(raw) =>
                void updateClip(video.id, { categories: parseCategories(raw) }).then(refresh)
              }
            />
          </div>
          <SavedField
            id={`text-${video.id}`}
            label={t('studio.line')}
            value={video.captions[0]?.text ?? ''}
            onSave={(line) => void updateClip(video.id, { line }).then(refresh)}
          />
        </div>
      ))}

      {page !== null && page.total > PAGE && (
        <div className="row between gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={offset === 0}
            onClick={() => setOffset((at) => Math.max(0, at - PAGE))}
          >
            {t('studio.previousPage')}
          </button>
          <span className="card-meta mono">
            {t('studio.showing', offset + 1, Math.min(offset + PAGE, page.total), page.total)}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={offset + PAGE >= page.total}
            onClick={() => setOffset((at) => at + PAGE)}
          >
            {t('studio.nextPage')}
          </button>
        </div>
      )}
    </div>
  )
}
