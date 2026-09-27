import { useState, type FormEvent } from 'react'
import { ApiError } from '../lib/api'
import { useRemote } from '../lib/remote'
import { repository } from '../repository'
import { useNavigate } from 'react-router-dom'
import { AvatarSlot } from '../components/AvatarSlot'
import { Dialog } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { LOCALE_CODES, LOCALES, useI18n } from '../i18n'
import { applyTheme, storedTheme, THEMES, type Theme } from '../lib/theme'
import { useApp } from '../store/context'

export function ProfileScreen() {
  const { data, isAdmin, logout, updateProfile } = useApp()
  const { t, locale, setLocale } = useI18n()
  const navigate = useNavigate()
  const profile = data.profile

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(profile?.name ?? '')
  const [avatar, setAvatar] = useState<Blob | null>(null)
  const [exporting, setExporting] = useState(false)
  const [changing, setChanging] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(storedTheme)
  // Above the early return: a hook after it runs on some renders and not
  // others, which is the one thing React cannot cope with.
  const summary = useRemote('', () => repository.librarySummary())

  if (!profile) return null

  const avatarUrl = profile.avatarUrl

  const openEdit = () => {
    setName(profile.name)
    setAvatar(null)
    setEditing(true)
  }

  const save = async () => {
    await updateProfile(name.trim() || profile.name, avatar)
    setEditing(false)
  }

  const signOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  // The learner's own copy, saved as a file. Fetched rather than linked so a
  // failure can be said on this screen instead of in a tab of raw JSON.
  const exportData = async () => {
    setExporting(true)
    setNote(null)
    try {
      const file = await repository.exportAccount()
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = `shadowline-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : t('profile.failed'))
    } finally {
      setExporting(false)
    }
  }

  const stats = [
    {
      label: t('profile.clipsInLibrary'),
      // From the library's own summary: counting a list the app had been sent
      // is what that list was costing 7.4MB for.
      value: summary.state === 'ready' ? summary.value.clips : '—',
    },
    { label: t('profile.totalTakes'), value: data.takes.length },
    { label: t('profile.wordsTracked'), value: data.vocab.length },
  ]

  return (
    <div className="stack gap-6" style={{ maxWidth: 420, margin: '0 auto', alignItems: 'center', textAlign: 'center' }}>
      <h1>{t('profile.title')}</h1>

      <div className="card elev-sm row gap-3" style={{ width: '100%', justifyContent: 'center' }}>
        <AvatarSlot src={avatarUrl} size={56} />
        <div style={{ textAlign: 'left' }}>
          <div className="card-title">{profile.name}</div>
          <div className="card-meta">{profile.email}</div>
        </div>
      </div>

      <div className="card elev-sm stack gap-2" style={{ width: '100%', textAlign: 'left' }}>
        <div className="card-kicker">{t('profile.account')}</div>
        {stats.map((stat) => (
          <div className="row between" style={{ fontSize: 14 }} key={stat.label}>
            <span style={{ color: 'var(--color-text-muted)' }}>{stat.label}</span>
            <span className="mono">{stat.value}</span>
          </div>
        ))}
      </div>

      {/*
        No switch here any more. Admin is decided by the server from
        ADMIN_EMAILS, and the switch that used to sit on this screen granted it
        to anyone who found it.
      */}
      {/* The language, on the screen that holds everything else about the
          person rather than behind a flag in a corner. Each language is named
          in itself: somebody who has landed in one they cannot read has to be
          able to find their own in the list. */}
      <div className="card elev-sm stack gap-2" style={{ width: '100%', textAlign: 'left' }}>
        <div className="card-kicker">{t('profile.language')}</div>
        <div className="row gap-2 wrap">
          {LOCALE_CODES.map((code) => (
            <button
              type="button"
              key={code}
              lang={code}
              className={`btn ${code === locale ? 'btn-primary' : 'btn-secondary'}`}
              aria-pressed={code === locale}
              onClick={() => setLocale(code)}
            >
              {LOCALES[code].name}
            </button>
          ))}
        </div>
      </div>

      {/* Light, dark, or the device's: this device's choice, not the account's,
          so a phone at night and a classroom screen can each have their own. */}
      <div className="card elev-sm stack gap-2" style={{ width: '100%', textAlign: 'left' }}>
        <div className="card-kicker">{t('profile.theme')}</div>
        <div className="row gap-2 wrap">
          {THEMES.map((one) => (
            <button
              type="button"
              key={one}
              className={`btn ${one === theme ? 'btn-primary' : 'btn-secondary'}`}
              aria-pressed={one === theme}
              onClick={() => {
                applyTheme(one)
                setTheme(one)
              }}
            >
              {t(`profile.theme.${one}`)}
            </button>
          ))}
        </div>
      </div>

      {isAdmin && (
        <div className="card elev-sm stack gap-2" style={{ width: '100%', textAlign: 'left' }}>
          <div className="card-kicker">{t('nav.studio')}</div>
          <div className="row between gap-3">
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{t('profile.studioBody')}</span>
            {/* Out of the app: the console is a separate build served at
                /admin/ on this origin, so this leaves rather than routes. */}
            <a className="btn btn-primary" style={{ flexShrink: 0 }} href="/admin/">
              {t('profile.open')}
            </a>
          </div>
        </div>
      )}

      <div className="card elev-sm stack gap-2" style={{ width: '100%', textAlign: 'left' }}>
        <div className="card-kicker">{t('profile.yourData')}</div>
        <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{t('profile.exportBody')}</span>
        <div className="row gap-2 wrap">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={exporting}
            onClick={() => void exportData()}
          >
            {exporting ? t('profile.exporting') : t('profile.export')}
          </button>
          {/* Only where the server keeps passwords: an account that signs in
              with Google alone has none here to change. */}
          {profile.passwords && (
            <button type="button" className="btn btn-secondary" onClick={() => setChanging(true)}>
              {t('profile.password')}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => setDeleting(true)}>
            {t('profile.delete')}
          </button>
        </div>
        {note !== null && (
          <div className="card-meta" role="status">
            {note}
          </div>
        )}
      </div>

      <div className="row gap-2" style={{ width: '100%' }}>
        <button type="button" className="btn btn-primary btn-block" onClick={openEdit}>
          {t('profile.edit')}
        </button>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => void signOut()}>
          <Icon name="log-out" size={15} />
          {t('nav.logout')}
        </button>
      </div>

      {changing && (
        <PasswordDialog
          onClose={() => setChanging(false)}
          onChanged={() => {
            setChanging(false)
            setNote(t('profile.passwordChanged'))
          }}
        />
      )}

      {deleting && (
        <DeleteAccountDialog
          email={profile.email}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            // The session is already gone on the server; this clears the
            // app's copy of everything and goes to the door.
            void logout().finally(() => navigate('/login', { replace: true }))
          }}
        />
      )}

      {editing && (
        <Dialog
          title={t('profile.editTitle')}
          onClose={() => setEditing(false)}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                {t('profile.cancel')}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void save()}>
                {t('profile.save')}
              </button>
            </>
          }
        >
          <div className="row gap-3">
            <AvatarSlot src={avatarUrl} size={64} editable onPick={setAvatar} />
            <div style={{ fontSize: 14, color: 'var(--color-text-muted)', textAlign: 'left' }}>
              {t('profile.avatarHint')}
            </div>
          </div>
          <div className="field" style={{ textAlign: 'left' }}>
            <label htmlFor="profile-name">{t('profile.name')}</label>
            <input
              id="profile-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {/* The address comes from Google or Keycloak and identifies the
              account, so it is shown rather than edited. */}
          <div className="field" style={{ textAlign: 'left' }}>
            <label htmlFor="profile-email">{t('profile.email')}</label>
            <input id="profile-email" className="input" value={profile.email} readOnly disabled />
          </div>
        </Dialog>
      )}
    </div>
  )
}

function PasswordDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { t } = useI18n()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (next.length < 8) return setProblem(t('profile.passwordShort'))
    if (next !== again) return setProblem(t('profile.passwordMismatch'))
    setSaving(true)
    setProblem(null)
    try {
      await repository.changePassword(current, next)
      onChanged()
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t('profile.failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      title={t('profile.passwordTitle')}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('profile.cancel')}
          </button>
          <button type="submit" form="password-form" className="btn btn-primary" disabled={saving}>
            {t('profile.save')}
          </button>
        </>
      }
    >
      <form id="password-form" className="stack gap-2" style={{ textAlign: 'left' }} onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label htmlFor="password-current">{t('profile.passwordCurrent')}</label>
          <input
            id="password-current"
            className="input"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password-next">{t('profile.passwordNext')}</label>
          <input
            id="password-next"
            className="input"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password-again">{t('profile.passwordAgain')}</label>
          <input
            id="password-again"
            className="input"
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
          />
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

/**
 * The last question before an account goes. The learner types their own
 * address: this cannot be undone, and a stray tap is not consent to lose a
 * year of recordings.
 */
function DeleteAccountDialog({
  email,
  onClose,
  onDeleted,
}: {
  email: string
  onClose: () => void
  onDeleted: () => void
}) {
  const { t } = useI18n()
  const [typed, setTyped] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const matches = typed.trim().toLowerCase() === email.toLowerCase()

  const confirm = async () => {
    setBusy(true)
    setProblem(null)
    try {
      await repository.deleteAccount(typed.trim())
      onDeleted()
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t('profile.failed'))
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={t('profile.deleteTitle')}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('profile.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={!matches || busy}
            onClick={() => void confirm()}
          >
            {t('profile.deleteForever')}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, textAlign: 'left' }}>{t('profile.deleteBody')}</p>
      <div className="field" style={{ textAlign: 'left' }}>
        <label htmlFor="delete-confirm">{t('profile.deleteConfirm', email)}</label>
        <input
          id="delete-confirm"
          className="input"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>
      {problem !== null && (
        <div className="card-meta" role="alert">
          {problem}
        </div>
      )}
    </Dialog>
  )
}
