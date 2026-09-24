import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ConfirmDelete } from '../components/ConfirmDelete'
import { Dialog } from '../components/Dialog'
import { Loading } from '../components/LoadState'
import { LOCALES, LOCALE_CODES, useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { repository, type Banner, type BannerInput, type BannerPlacement } from '../repository'

type Status = 'live' | 'scheduled' | 'ended' | 'off'

/** Where a banner stands now. Worked out here from the same fields the server
 *  uses to decide what a learner sees, so the tag and the screen agree. */
function statusOf(banner: Banner, now: number): Status {
  if (!banner.enabled) return 'off'
  if (banner.startsAt && Date.parse(banner.startsAt) > now) return 'scheduled'
  if (banner.endsAt && Date.parse(banner.endsAt) <= now) return 'ended'
  return 'live'
}

const STATUS_TAG: Record<Status, string> = {
  live: 'tag tag-good',
  scheduled: 'tag tag-accent',
  ended: 'tag tag-neutral',
  off: 'tag tag-outline',
}

const EMPTY: BannerInput = {
  title: '',
  body: '',
  linkUrl: '',
  linkLabel: '',
  placement: 'dashboard',
  locale: '',
  startsAt: null,
  endsAt: null,
  enabled: true,
  position: 0,
}

/** An ISO time as a datetime-local input wants it: local, to the minute. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A datetime-local value back to ISO. The input is in the admin's own zone,
 *  which is the zone they mean "Monday at nine" in. */
function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

/**
 * Announcements on a learner's screen: a new series, an exam season, a
 * maintenance window. Each has a place, a language, and an optional window, so
 * one can be written a week ahead and appear and go on its own.
 */
export function Banners() {
  const { t, locale } = useI18n()
  const [banners, setBanners] = useState<Banner[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Banner | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Banner | null>(null)
  // The moment the statuses are judged at: when the list last loaded, which is
  // when the admin last looked. Re-read with every load.
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      setBanners(await repository.banners())
      setNow(Date.now())
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the banners.')
    }
  }, [])

  useEffect(() => {
    // Every setState inside load() runs after an await.
    // eslint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  const replace = (next: Banner) =>
    setBanners((current) => {
      if (!current) return [next]
      return current.some((b) => b.id === next.id)
        ? current.map((b) => (b.id === next.id ? next : b))
        : [next, ...current]
    })

  const toggle = async (banner: Banner) => {
    try {
      const { id: _id, imageUrl: _image, createdAt: _created, updatedAt: _updated, ...input } = banner
      replace(await repository.updateBanner(banner.id, { ...input, enabled: !banner.enabled }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change that.')
    }
  }

  const remove = async (banner: Banner) => {
    setDeleting(null)
    try {
      await repository.deleteBanner(banner.id)
      setBanners((current) => current?.filter((b) => b.id !== banner.id) ?? null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete that.')
    }
  }

  const when = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="stack gap-3">
      <div className="row between wrap gap-2">
        <div>
          <h1 style={{ marginBottom: 2 }}>{t('banners.title')}</h1>
          <div className="card-meta">{t('banners.subtitle')}</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          {t('banners.new')}
        </button>
      </div>

      {error !== null && (
        <div className="card-meta" role="alert">
          {error}
        </div>
      )}
      {banners === null && error === null && <Loading />}
      {banners !== null && banners.length === 0 && <div className="card-meta">{t('banners.none')}</div>}

      {banners?.map((banner) => {
        const status = statusOf(banner, now)
        return (
          <div className="card elev-sm row gap-3 banner-row" key={banner.id}>
            {banner.imageUrl && <img className="banner-thumb" src={banner.imageUrl} alt="" />}
            <div className="stack gap-1" style={{ flex: 1, minWidth: 0 }}>
              <div className="row gap-1 wrap">
                <span className="card-title">{banner.title}</span>
                <span className={STATUS_TAG[status]}>{t(`banners.status.${status}`)}</span>
              </div>
              {banner.body && <div className="card-meta">{banner.body}</div>}
              <div className="card-meta mono">
                {t(`banners.placement.${banner.placement}`)}
                {' · '}
                {banner.locale ? LOCALES[banner.locale as keyof typeof LOCALES]?.name ?? banner.locale : t('banners.everyLanguage')}
                {banner.startsAt && ` · ${t('banners.from', when(banner.startsAt))}`}
                {banner.endsAt && ` · ${t('banners.until', when(banner.endsAt))}`}
                {banner.linkUrl && ` · ${banner.linkUrl}`}
              </div>
            </div>
            <div className="row gap-1">
              <button type="button" className="btn btn-secondary" onClick={() => void toggle(banner)}>
                {banner.enabled ? t('banners.turnOff') : t('banners.turnOn')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(banner)}>
                {t('banners.edit')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setDeleting(banner)}>
                {t('common.delete')}
              </button>
            </div>
          </div>
        )
      })}

      {editing !== null && (
        <BannerForm
          banner={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            replace(saved)
            // Stays open on a new banner, now with an id, so a picture can be
            // added to it; an edit is done.
            setEditing(editing === 'new' ? saved : null)
          }}
          onImage={replace}
        />
      )}

      {deleting !== null && (
        <ConfirmDelete
          title={t('banners.deleteTitle')}
          body={t('banners.deleteBody', deleting.title)}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void remove(deleting)}
        />
      )}
    </div>
  )
}

function BannerForm({
  banner,
  onClose,
  onSaved,
  onImage,
}: {
  banner: Banner | null
  onClose: () => void
  onSaved: (banner: Banner) => void
  onImage: (banner: Banner) => void
}) {
  const { t } = useI18n()
  const [input, setInput] = useState<BannerInput>(() => {
    if (!banner) return EMPTY
    const { id: _id, imageUrl: _image, createdAt: _created, updatedAt: _updated, ...rest } = banner
    return rest
  })
  const [imageUrl, setImageUrl] = useState(banner?.imageUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const set = <K extends keyof BannerInput>(key: K, value: BannerInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setProblem(null)
    try {
      onSaved(banner ? await repository.updateBanner(banner.id, input) : await repository.createBanner(input))
    } catch (err) {
      // The server's own sentence: it is the one place that knows every rule.
      setProblem(err instanceof ApiError ? err.message : 'Could not save the banner.')
    } finally {
      setSaving(false)
    }
  }

  const upload = async (file: File | undefined) => {
    if (!banner || !file) return
    setProblem(null)
    try {
      const updated = await repository.bannerImage(banner.id, file)
      setImageUrl(updated.imageUrl)
      onImage(updated)
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not upload the picture.')
    }
  }

  const dropImage = async () => {
    if (!banner) return
    try {
      await repository.removeBannerImage(banner.id)
      setImageUrl('')
      onImage({ ...banner, ...input, imageUrl: '' })
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not remove the picture.')
    }
  }

  return (
    <Dialog
      title={banner ? t('banners.editTitle') : t('banners.newTitle')}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="banner-form" className="btn btn-primary" disabled={saving}>
            {saving ? t('banners.saving') : t('banners.save')}
          </button>
        </>
      }
    >
      <form id="banner-form" className="stack gap-3" onSubmit={(e) => void save(e)}>
        <label className="stack gap-1">
          <span className="card-kicker">{t('banners.fieldTitle')}</span>
          <input
            className="input"
            required
            maxLength={120}
            value={input.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </label>
        <label className="stack gap-1">
          <span className="card-kicker">{t('banners.fieldBody')}</span>
          <textarea
            className="input"
            rows={3}
            maxLength={400}
            value={input.body}
            onChange={(e) => set('body', e.target.value)}
          />
        </label>
        <div className="row gap-2 wrap">
          <label className="stack gap-1" style={{ flex: '2 1 220px' }}>
            <span className="card-kicker">{t('banners.fieldLink')}</span>
            <input
              className="input"
              placeholder="/library"
              value={input.linkUrl}
              onChange={(e) => set('linkUrl', e.target.value)}
            />
          </label>
          <label className="stack gap-1" style={{ flex: '1 1 140px' }}>
            <span className="card-kicker">{t('banners.fieldLabel')}</span>
            <input
              className="input"
              maxLength={40}
              disabled={!input.linkUrl}
              value={input.linkLabel}
              onChange={(e) => set('linkLabel', e.target.value)}
            />
          </label>
        </div>
        <div className="card-meta">{t('banners.fieldLinkHint')}</div>

        <div className="row gap-2 wrap">
          <label className="stack gap-1" style={{ flex: '1 1 140px' }}>
            <span className="card-kicker">{t('banners.fieldPlacement')}</span>
            <select
              className="input"
              value={input.placement}
              onChange={(e) => set('placement', e.target.value as BannerPlacement)}
            >
              <option value="dashboard">{t('banners.placement.dashboard')}</option>
              <option value="library">{t('banners.placement.library')}</option>
            </select>
          </label>
          <label className="stack gap-1" style={{ flex: '1 1 140px' }}>
            <span className="card-kicker">{t('banners.fieldLocale')}</span>
            <select className="input" value={input.locale} onChange={(e) => set('locale', e.target.value)}>
              <option value="">{t('banners.everyLanguage')}</option>
              {LOCALE_CODES.map((code) => (
                <option key={code} value={code}>
                  {LOCALES[code].name}
                </option>
              ))}
            </select>
          </label>
          <label className="stack gap-1" style={{ flex: '0 1 90px' }}>
            <span className="card-kicker">{t('banners.fieldPosition')}</span>
            <input
              className="input"
              type="number"
              value={input.position}
              onChange={(e) => set('position', Number(e.target.value) || 0)}
            />
          </label>
        </div>

        <div className="row gap-2 wrap">
          <label className="stack gap-1" style={{ flex: '1 1 180px' }}>
            <span className="card-kicker">{t('banners.fieldStarts')}</span>
            <input
              className="input"
              type="datetime-local"
              value={toLocalInput(input.startsAt)}
              onChange={(e) => set('startsAt', fromLocalInput(e.target.value))}
            />
          </label>
          <label className="stack gap-1" style={{ flex: '1 1 180px' }}>
            <span className="card-kicker">{t('banners.fieldEnds')}</span>
            <input
              className="input"
              type="datetime-local"
              value={toLocalInput(input.endsAt)}
              onChange={(e) => set('endsAt', fromLocalInput(e.target.value))}
            />
          </label>
        </div>
        <div className="card-meta">{t('banners.fieldWhenHint')}</div>

        <label className="row gap-2">
          <input type="checkbox" checked={input.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          <span>{t('banners.fieldEnabled')}</span>
        </label>

        <div className="stack gap-1">
          <span className="card-kicker">{t('banners.fieldImage')}</span>
          {banner ? (
            <>
              {imageUrl && <img className="banner-preview" src={imageUrl} alt="" />}
              <div className="row gap-2 wrap">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label={t('banners.fieldImage')}
                  onChange={(e) => void upload(e.target.files?.[0])}
                />
                {imageUrl && (
                  <button type="button" className="btn btn-ghost" onClick={() => void dropImage()}>
                    {t('banners.removeImage')}
                  </button>
                )}
              </div>
              <div className="card-meta">{t('banners.imageHint')}</div>
            </>
          ) : (
            <div className="card-meta">{t('banners.imageAfterSave')}</div>
          )}
        </div>

        {problem !== null && (
          <div className="card-meta" role="alert">
            {problem}
          </div>
        )}
      </form>
    </Dialog>
  )
}
