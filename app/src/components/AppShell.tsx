import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import type { MessageKey } from '../i18n/en'
import { useApp } from '../store/context'
import { Icon, type IconName } from './Icon'

/** Labels are keys, not words: the tabs are defined once at module scope and
 *  the language is only known inside a component. */
const TABS: { to: string; label: MessageKey; icon: IconName }[] = [
  { to: '/dashboard', label: 'nav.dashboard', icon: 'house-plus' },
  { to: '/library', label: 'nav.library', icon: 'book-open' },
  { to: '/vocabulary', label: 'nav.vocabulary', icon: 'message-square' },
  { to: '/progress', label: 'nav.progress', icon: 'chart-line' },
]

const PROFILE: { to: string; label: MessageKey; icon: IconName } = {
  to: '/profile',
  label: 'nav.profile',
  icon: 'user-round',
}

const STUDIO: { to: string; label: MessageKey; icon: IconName } = {
  to: '/admin',
  label: 'nav.studio',
  icon: 'scissors',
}

/**
 * How far each plank hangs off true, in order.
 *
 * Straight from the design, where no two planks are level: a rope ladder nailed
 * up by hand does not come out square, and six identical rectangles would read
 * as a list of buttons with wood printed on them. The angles repeat past the
 * sixth plank, which only happens for an admin.
 */
const TILTS = ['-1.2deg', '1deg', '-0.8deg', '1.3deg', '-1deg', '0.7deg']

export function AppShell() {
  const t = useT()
  const [collapsed, setCollapsed] = useState(false)
  const { isAdmin, logout } = useApp()
  const navigate = useNavigate()

  const signOut = () => {
    void logout()
    navigate('/login', { replace: true })
  }

  const items = [...TABS, ...(isAdmin ? [STUDIO] : []), PROFILE]

  return (
    <div className="app">
      <nav className="sidebar" data-collapsed={collapsed} aria-label="Main">
        {/* The forest, the tree it is nailed to, and the two ropes the planks
            hang from. All of it decoration — a screen reader hears a list of
            links and nothing about a tree. */}
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
          <span className="menu-sign-title">{collapsed ? 'SL' : 'SHADOWLINE'}</span>
          <span className="menu-sign-tagline">{collapsed ? t('nav.quest') : t('nav.tagline')}</span>
        </div>

        <ul className="menu-planks">
          {items.map((tab, i) => (
            <li key={tab.to} style={{ '--tilt': TILTS[i % TILTS.length] } as React.CSSProperties}>
              <NavLink to={tab.to} className="menu-plank" title={t(tab.label)}>
                <span className="menu-nail" />
                <Icon name={tab.icon} size={26} />
                {/* The badge lives inside the label rather than beside it,
                    because collapsed the label becomes a sign that swings out
                    and the badge has to swing out with it. */}
                <span className="menu-plank-label">
                  <span className="menu-plank-text">{t(tab.label)}</span>
                  <span className="menu-badge">{t('nav.here')}</span>
                </span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="menu-actions">
          <button
            type="button"
            className="menu-key"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
          >
            <Icon name={collapsed ? 'chevrons-right' : 'chevrons-left'} size={20} />
            <span className="menu-key-label">{t('nav.collapseShort')}</span>
          </button>
          <button type="button" className="menu-key" onClick={signOut} title={t('nav.logout')}>
            <Icon name="log-out" size={20} />
            <span className="menu-key-label">{t('nav.logout')}</span>
          </button>
        </div>
      </nav>

      <main className="app-content">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Main">
        {[...TABS, PROFILE].map((tab) => (
          <NavLink key={tab.to} to={tab.to} className="tabbar-link">
            <Icon name={tab.icon} size={19} />
            {t(tab.label)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
