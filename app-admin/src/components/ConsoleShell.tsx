import { NavLink, Outlet } from 'react-router-dom'
import { useT } from '../i18n'
import type { MessageKey } from '../i18n/en'
import { Icon, type IconName } from './Icon'
import { LOGIN_URL, useSession } from '../session'
import { repository } from '../repository'

/**
 * The console's frame: a sidebar of sections and the page beside it.
 *
 * Deliberately not the learner app's shell. That one is a rope ladder nailed to
 * a tree, which is right for somebody practising English on a phone and wrong
 * for somebody working through four hundred clips at a desk.
 */

interface Section {
  to: string
  label: MessageKey
  icon: IconName
}

const SECTIONS: Section[] = [
  { to: '/cut', label: 'nav.cut', icon: 'scissors' },
  { to: '/uploads', label: 'nav.uploads', icon: 'upload' },
  { to: '/clips', label: 'nav.clips', icon: 'book-open' },
  { to: '/series', label: 'nav.series', icon: 'layers' },
  { to: '/users', label: 'nav.users', icon: 'user' },
  { to: '/banners', label: 'nav.banners', icon: 'flame' },
  { to: '/tutor', label: 'nav.tutor', icon: 'message-square' },
]

export function ConsoleShell() {
  const t = useT()
  const session = useSession()
  const user = session.state === 'ready' ? session.user : null

  const signOut = () => {
    void repository.logout().finally(() => {
      window.location.href = LOGIN_URL
    })
  }

  return (
    <div className="console">
      <nav className="console-rail">
        <div className="console-brand">
          <span className="console-brand-mark">SL</span>
          <span>Console</span>
        </div>

        <ul className="console-nav">
          {SECTIONS.map((section) => (
            <li key={section.to}>
              <NavLink to={section.to} className="console-link">
                <Icon name={section.icon} size={16} />
                <span>{t(section.label)}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="console-foot">
          {/* Out of the console and back to the app: one link, because an admin
              is also somebody who practises, and the two live on one origin. */}
          <a className="console-link" href="/dashboard">
            <Icon name="house-plus" size={16} />
            <span>{t('nav.back')}</span>
          </a>
          <div className="console-who">
            <div className="console-who-name">{user?.name}</div>
            <div className="console-who-mail">{user?.email}</div>
          </div>
          <button type="button" className="btn btn-secondary btn-block" onClick={signOut}>
            <Icon name="log-out" size={15} />
            {t('nav.signOut')}
          </button>
        </div>
      </nav>

      <main className="console-page">
        <Outlet />
      </main>
    </div>
  )
}
