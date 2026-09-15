import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useApp } from '../store/context'
import { Icon, type IconName } from './Icon'

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/library', label: 'Library', icon: 'library' },
  { to: '/vocabulary', label: 'Vocabulary', icon: 'book' },
  { to: '/progress', label: 'Progress', icon: 'chart' },
]

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const { logout } = useApp()
  const navigate = useNavigate()

  const signOut = () => {
    logout()
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
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} />
          </button>
        </div>

        <div className="sidebar-links">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} className="nav-link" title={tab.label}>
              <Icon name={tab.icon} size={17} />
              {!collapsed && tab.label}
            </NavLink>
          ))}
        </div>

        <div className="sidebar-foot">
          <NavLink to="/profile" className="nav-link" style={{ flex: 1, minWidth: 0 }} title="Profile">
            <Icon name="user" size={17} />
            {!collapsed && 'Profile'}
          </NavLink>
          {!collapsed && (
            <button type="button" className="btn btn-icon btn-ghost" onClick={signOut} title="Log out">
              <Icon name="log-out" />
            </button>
          )}
        </div>
      </nav>

      <main className="app-content">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Main">
        {[...TABS, { to: '/profile', label: 'Profile', icon: 'user' as IconName }].map((tab) => (
          <NavLink key={tab.to} to={tab.to} className="tabbar-link">
            <Icon name={tab.icon} size={19} />
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
