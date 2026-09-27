import type { CSSProperties } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useT } from '../i18n'
import type { MessageKey } from '../i18n/en'
import { Icon, type IconName } from './Icon'
import { LOGIN_URL, useSession } from '../session'
import { repository } from '../repository'

/**
 * The console's frame: a sidebar of sections and the page beside it.
 *
 * The learner app's menu, so the two read as one product: the forest, the tree,
 * the rope ladder and a plank per place. Smaller planks than the app's, because
 * there are seven of them and the console is worked at a desk, and no collapsed
 * rail — the pages here want width less than a phone does.
 */

/** How far each plank hangs off true, as in the learner app's menu. */
const TILTS = ['-1.2deg', '1deg', '-0.8deg', '1.3deg', '-1deg', '0.7deg', '-0.6deg']

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
      <nav className="console-rail" aria-label="Console">
        {/* Decoration only: a screen reader hears a list of links. */}
        <div className="menu-scene" aria-hidden="true">
          <span className="menu-forest" />
          <span className="menu-trunk" />
          <span className="menu-rings" />
          <span className="menu-rope menu-rope-left" />
          <span className="menu-rope menu-rope-right" />
          <span className="menu-firefly menu-firefly-high" />
          <span className="menu-firefly menu-firefly-low" />
        </div>

        <div className="menu-sign">
          <span className="menu-sign-title">SHADOWLINE</span>
          <span className="menu-sign-tagline">{t('nav.tagline')}</span>
        </div>

        <ul className="menu-planks">
          {SECTIONS.map((section, i) => (
            <li key={section.to} style={{ '--tilt': TILTS[i % TILTS.length] } as CSSProperties}>
              <NavLink to={section.to} className="menu-plank">
                <span className="menu-nail" />
                <Icon name={section.icon} size={20} />
                <span className="menu-plank-text">{t(section.label)}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="menu-who">
          <div className="menu-who-name">{user?.name}</div>
          <div className="menu-who-mail">{user?.email}</div>
        </div>

        <div className="menu-actions">
          {/* Out of the console and back to the app: an admin is also somebody
              who practises, and the two live on one origin. */}
          <a className="menu-key" href="/dashboard" title={t('nav.back')}>
            <Icon name="house-plus" size={18} />
            <span className="menu-key-label">{t('nav.back')}</span>
          </a>
          <button type="button" className="menu-key" onClick={signOut} title={t('nav.signOut')}>
            <Icon name="log-out" size={18} />
            <span className="menu-key-label">{t('nav.signOut')}</span>
          </button>
        </div>
      </nav>

      <main className="console-page">
        <Outlet />
      </main>
    </div>
  )
}
