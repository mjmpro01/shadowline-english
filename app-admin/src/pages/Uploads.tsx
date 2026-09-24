import { useCallback, useEffect, useState } from 'react'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'
import { Loading } from '../components/LoadState'
import { ApiError } from '../lib/api'
import { useDebounced } from '../lib/remote'
import { clock } from '../lib/time'
import { repository, type Upload, type UploadStatus } from '../repository'

/** Rows per page. Mirrors the server's own default, which is what caps it. */
const PAGE = 25

/** How often to ask again while anything is still moving. Transcribing an hour
 *  takes minutes and cutting a clip takes seconds, so this is for watching, not
 *  for racing. */
const POLL_MS = 4000

/** The statuses worth filtering by, in the order an upload passes through them. */
const STATES: UploadStatus[] = [
  'uploading',
  'upload-failed',
  'transcribing',
  'transcribe-failed',
  'ready',
  'cutting',
  'cut-failed',
  'done',
]

/** Which statuses mean work is still happening, so the page refreshes itself. */
const MOVING: UploadStatus[] = ['uploading', 'transcribing', 'cutting']

/**
 * Every recording an admin has sent, and how far each one got.
 *
 * Before this the answer to "did my film upload?" was to look for its clips in
 * the library, which says nothing at all about a transfer that died, a transcript
 * that never arrived, or clips whose picture the cutter gave up on. Each of those
 * was already written down somewhere; none of it was anywhere anybody could see.
 */
export function Uploads() {
  const t = useT()
  const [query, setQuery] = useState('')
  const settled = useDebounced(query.trim(), 250)
  const [state, setState] = useState<UploadStatus | ''>('')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<{ uploads: Upload[]; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(
    async (at: number) => {
      try {
        setPage(await repository.uploads(settled, state, PAGE, at))
        setError(null)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load the uploads.')
      }
    },
    [settled, state],
  )

  // A new search or filter starts at the first page: staying on page four would
  // show an empty screen and no reason for it.
  useEffect(() => {
    setOffset(0)
  }, [settled, state])

  useEffect(() => {
    // Every setState inside load() runs after an await, so none of them happens
    // during this effect — the rule cannot see through the async boundary.
    // eslint-disable-next-line react/set-state-in-effect
    void load(offset)
  }, [load, offset])

  // While something is still moving, ask again. Stops on its own when everything
  // has settled, so an idle console is not polling for the sake of it.
  const moving = page?.uploads.some((upload) => MOVING.includes(upload.status)) ?? false
  useEffect(() => {
    if (!moving) return
    const timer = setInterval(() => void load(offset), POLL_MS)
    return () => clearInterval(timer)
  }, [moving, load, offset])

  const refresh = () => void load(offset)

  const retry = async (upload: Upload) => {
    setNote(null)
    try {
      const queued = await repository.retryUpload(upload.id)
      setNote(
        queued.transcribe + queued.cuts === 0
          ? t('uploads.nothingToRetry')
          : t('uploads.retried', queued.transcribe, queued.cuts),
      )
      refresh()
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : 'Could not retry that.')
    }
  }

  return (
    <div className="stack gap-3">
      <div>
        <h1 style={{ marginBottom: 2 }}>{t('uploads.title')}</h1>
        <div className="card-meta">
          {page === null ? '—' : t('uploads.count', page.total)}
        </div>
      </div>

      <div className="row gap-2 wrap">
        <input
          className="input"
          style={{ flex: '1 1 220px' }}
          placeholder={t('uploads.find')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('uploads.findLabel')}
        />
        <select
          className="input"
          style={{ flex: '0 0 auto' }}
          value={state}
          aria-label={t('uploads.filterLabel')}
          onChange={(e) => setState(e.target.value as UploadStatus | '')}
        >
          <option value="">{t('uploads.anyState')}</option>
          {STATES.map((one) => (
            <option key={one} value={one}>
              {t(`uploads.state.${one}` as 'uploads.state.done')}
            </option>
          ))}
        </select>
      </div>

      {note !== null && <div className="card-meta">{note}</div>}
      {error !== null && <div className="card-meta">{error}</div>}
      {page === null && error === null && <Loading />}
      {page !== null && page.uploads.length === 0 && (
        <div className="card-meta">
          {settled || state ? t('uploads.noMatch') : t('uploads.none')}
        </div>
      )}

      {page?.uploads.map((upload) => (
        <div className="card elev-sm stack gap-2" key={upload.id}>
          <div className="row between wrap gap-2">
            <div className="stack">
              <div className="card-title">{upload.name || upload.title}</div>
              <span className="card-meta mono">
                {new Date(upload.createdAt).toLocaleString()}
                {upload.bytes > 0 && ` · ${megabytes(upload.bytes)}`}
                {upload.seconds > 0 && ` · ${clock(upload.seconds)}`}
                {upload.playlistTitle && ` · ${upload.playlistTitle}`}
              </span>
            </div>
            <div className="row gap-2">
              <StatusTag status={upload.status} />
              {/* Only where there is something to put back. Offering it on a row
                  with nothing failed would promise work that never starts. */}
              {(upload.status === 'transcribe-failed' || upload.status === 'cut-failed') && (
                <button type="button" className="btn btn-secondary" onClick={() => void retry(upload)}>
                  {t('uploads.retry')}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                aria-expanded={open === upload.id}
                onClick={() => setOpen(open === upload.id ? null : upload.id)}
              >
                <Icon name={open === upload.id ? 'chevrons-left' : 'chevrons-right'} size={15} />
                {t('uploads.details')}
              </button>
            </div>
          </div>

          {/* The reason, where there is one. This is the column the whole
              two-step upload exists to be able to fill in. */}
          {upload.error !== '' && <div className="card-meta">{upload.error}</div>}

          {open === upload.id && <Details upload={upload} />}
        </div>
      ))}

      {page !== null && page.total > PAGE && (
        <div className="row between gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
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
            onClick={() => setOffset(offset + PAGE)}
          >
            {t('studio.nextPage')}
          </button>
        </div>
      )}
    </div>
  )
}

/** The status, in a word, with its own tint for the two that need acting on. */
function StatusTag({ status }: { status: UploadStatus }) {
  const t = useT()
  const bad = status === 'upload-failed' || status === 'transcribe-failed' || status === 'cut-failed'
  const done = status === 'done'
  return (
    <span className={`tag ${bad ? 'tag-warn' : done ? 'tag-good' : 'tag-neutral'}`}>
      {t(`uploads.state.${status}` as 'uploads.state.done')}
    </span>
  )
}

/** The counts behind the status, which is what says what to do about it. */
function Details({ upload }: { upload: Upload }) {
  const t = useT()
  const rows: [string, string | number][] = [
    [t('uploads.clips'), upload.clips],
    [t('uploads.transcript'), t(`uploads.transcript.${upload.transcript}` as 'uploads.transcript.ready')],
  ]
  if (upload.transcribeAttempts > 0) {
    rows.push([t('uploads.attempts'), upload.transcribeAttempts])
  }
  if (upload.hasVideo) {
    rows.push([t('uploads.cutsLeft'), upload.cutsLeft])
    if (upload.cutsFailed > 0) rows.push([t('uploads.cutsFailed'), upload.cutsFailed])
  }
  // Worth its own row rather than a footnote: a clip with no sound is kept and
  // measured but never scored, and nothing else says so.
  if (upload.clipsWithoutAudio > 0) {
    rows.push([t('uploads.withoutAudio'), upload.clipsWithoutAudio])
  }

  return (
    <div className="stack gap-1" style={{ borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-2)' }}>
      {rows.map(([label, value]) => (
        <div className="row between" style={{ fontSize: 13 }} key={label}>
          <span style={{ opacity: 0.7 }}>{label}</span>
          <span className="mono">{value}</span>
        </div>
      ))}
      {upload.transcribeError !== '' && (
        <div className="card-meta">{upload.transcribeError}</div>
      )}
    </div>
  )
}

/** Sizes read in megabytes; a recording is identified in practice by being the
 *  big one. */
function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
