import { useState } from 'react'
import { useRemote } from '../lib/remote'
import { repository } from '../repository'
import { useNavigate } from 'react-router-dom'
import { AvatarSlot } from '../components/AvatarSlot'
import { Dialog } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { LOCALE_CODES, LOCALES, useI18n } from '../i18n'
import { useApp } from '../store/context'

export function ProfileScreen() {
  const { data, isAdmin, logout, updateProfile } = useApp()
  const { t, locale, setLocale } = useI18n()
  const navigate = useNavigate()
  const profile = data.profile

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(profile?.name ?? '')
  const [avatar, setAvatar] = useState<Blob | null>(null)
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
            <span style={{ opacity: 0.7 }}>{stat.label}</span>
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

      {isAdmin && (
        <div className="card elev-sm stack gap-2" style={{ width: '100%', textAlign: 'left' }}>
          <div className="card-kicker">{t('nav.studio')}</div>
          <div className="row between gap-3">
            <span style={{ fontSize: 13, opacity: 0.75 }}>{t('profile.studioBody')}</span>
            {/* Out of the app: the console is a separate build served at
                /admin/ on this origin, so this leaves rather than routes. */}
            <a className="btn btn-primary" style={{ flexShrink: 0 }} href="/admin/">
              {t('profile.open')}
            </a>
          </div>
        </div>
      )}

      <div className="row gap-2" style={{ width: '100%' }}>
        <button type="button" className="btn btn-primary btn-block" onClick={openEdit}>
          {t('profile.edit')}
        </button>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => void signOut()}>
          <Icon name="log-out" size={15} />
          {t('nav.logout')}
        </button>
      </div>

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
            <div style={{ fontSize: 12, opacity: 0.6, textAlign: 'left' }}>
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
