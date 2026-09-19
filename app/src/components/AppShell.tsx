import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import type { MessageKey } from '../i18n/en'
import { useApp } from '../store/context'
import { Icon, type IconName } from './Icon'

/** Labels are keys, not words: the tabs are defined once at module scope and
 *  the language is only known inside a component. */
const TABS: { to: string; label: MessageKey; icon: IconName }[] = [
  { to: '/dashboard', label: 'nav.dashboard', icon: 'grid' },
  { to: '/library', label: 'nav.library', icon: 'library' },
  { to: '/vocabulary', label: 'nav.vocabulary', icon: 'book' },
  { to: '/progress', label: 'nav.progress', icon: 'chart' },
]

export function AppShell() {
  const t = useT()
  const [collapsed, setCollapsed] = useState(false)
  const { isAdmin, logout } = useApp()
  const navigate = useNavigate()

  const signOut = () => {
    void logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app">
      <nav className="sidebar" data-collapsed={collapsed} aria-label="Main">
        <div className="sidebar-head">
          {!collapsed && <div className="nav-brand">Shadowline</div>}
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} />
          </button>
        </div>

        <div className="sidebar-links">
          {(isAdmin
            ? [...TABS, { to: '/admin', label: 'nav.studio' as MessageKey, icon: 'scissors' as IconName }]
            : TABS
          ).map((tab) => (
            <NavLink key={tab.to} to={tab.to} className="nav-link" title={t(tab.label)}>
              <Icon name={tab.icon} size={17} />
              {!collapsed && t(tab.label)}
            </NavLink>
          ))}
        </div>

        <div className="sidebar-foot">
          <NavLink
            to="/profile"
            className="nav-link"
            style={{ flex: 1, minWidth: 0 }}
            title={t('nav.profile')}
          >
            <Icon name="user" size={17} />
            {!collapsed && t('nav.profile')}
          </NavLink>
          {!collapsed && (
            <button
              type="button"
              className="btn btn-icon btn-ghost"
              onClick={signOut}
              title={t('nav.logout')}
            >
              <Icon name="log-out" />
            </button>
          )}
        </div>
      </nav>

      <main className="app-content">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Main">
        {[...TABS, { to: '/profile', label: 'nav.profile' as MessageKey, icon: 'user' as IconName }].map(
          (tab) => (
            <NavLink key={tab.to} to={tab.to} className="tabbar-link">
              <Icon name={tab.icon} size={19} />
              {t(tab.label)}
            </NavLink>
          ),
        )}
      </nav>
    </div>
  )
}
