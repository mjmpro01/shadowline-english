import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AvatarSlot } from '../components/AvatarSlot'
import { Dialog } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { useApp } from '../store/context'

export function ProfileScreen() {
  const { data, isAdmin, logout, updateProfile } = useApp()
  const navigate = useNavigate()
  const profile = data.profile

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(profile?.name ?? '')
  const [avatar, setAvatar] = useState<Blob | null>(null)

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
    { label: 'Clips in the library', value: data.videos.length },
    { label: 'Total takes', value: data.takes.length },
    { label: 'Words tracked', value: data.vocab.length },
  ]

  return (
    <div className="stack gap-6" style={{ maxWidth: 420, margin: '0 auto', alignItems: 'center', textAlign: 'center' }}>
      <h1>Profile</h1>

      <div className="card elev-sm row gap-3" style={{ width: '100%', justifyContent: 'center' }}>
        <AvatarSlot src={avatarUrl} size={56} />
        <div style={{ textAlign: 'left' }}>
          <div className="card-title">{profile.name}</div>
          <div className="card-meta">{profile.email}</div>
        </div>
      </div>

      <div className="card elev-sm stack gap-2" style={{ width: '100%', textAlign: 'left' }}>
        <div className="card-kicker">Account</div>
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
      {isAdmin && (
        <div className="card elev-sm stack gap-2" style={{ width: '100%', textAlign: 'left' }}>
          <div className="card-kicker">Clip studio</div>
          <div className="row between gap-3">
            <span style={{ fontSize: 13, opacity: 0.75 }}>
              Cut recordings into clips for the library.
            </span>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flexShrink: 0 }}
              onClick={() => navigate('/admin')}
            >
              Open
            </button>
          </div>
        </div>
      )}

      <div className="row gap-2" style={{ width: '100%' }}>
        <button type="button" className="btn btn-primary btn-block" onClick={openEdit}>
          Edit profile
        </button>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => void signOut()}>
          <Icon name="log-out" size={15} />
          Log out
        </button>
      </div>

      {editing && (
        <Dialog
          title="Edit profile"
          onClose={() => setEditing(false)}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void save()}>
                Save
              </button>
            </>
          }
        >
          <div className="row gap-3">
            <AvatarSlot src={avatarUrl} size={64} editable onPick={setAvatar} />
            <div style={{ fontSize: 12, opacity: 0.6, textAlign: 'left' }}>
              Drop an image on the avatar, or click it to browse
            </div>
          </div>
          <div className="field" style={{ textAlign: 'left' }}>
            <label htmlFor="profile-name">Name</label>
            <input
              id="profile-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {/* The address comes from Google and is what identifies the account,
              so it is shown rather than edited. */}
          <div className="field" style={{ textAlign: 'left' }}>
            <label htmlFor="profile-email">Email</label>
            <input id="profile-email" className="input" value={profile.email} readOnly disabled />
          </div>
        </Dialog>
      )}
    </div>
  )
}
