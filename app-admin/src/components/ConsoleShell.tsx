import { NavLink, Outlet } from 'react-router-dom'
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
  label: string
  icon: IconName
}

const SECTIONS: Section[] = [
  { to: '/cut', label: 'Cut a recording', icon: 'scissors' },
  { to: '/uploads', label: 'Uploads', icon: 'upload' },
  { to: '/clips', label: 'Clips', icon: 'book-open' },
  { to: '/series', label: 'Series', icon: 'layers' },
]

export function ConsoleShell() {
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
                <span>{section.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="console-foot">
          {/* Out of the console and back to the app: one link, because an admin
              is also somebody who practises, and the two live on one origin. */}
          <a className="console-link" href="/dashboard">
            <Icon name="house-plus" size={16} />
            <span>Back to the app</span>
          </a>
          <div className="console-who">
            <div className="console-who-name">{user?.name}</div>
            <div className="console-who-mail">{user?.email}</div>
          </div>
          <button type="button" className="btn btn-secondary btn-block" onClick={signOut}>
            <Icon name="log-out" size={15} />
            Sign out
          </button>
        </div>
      </nav>

      <main className="console-page">
        <Outlet />
      </main>
    </div>
  )
}
