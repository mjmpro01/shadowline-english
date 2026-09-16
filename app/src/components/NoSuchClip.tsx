import { useNavigate } from 'react-router-dom'

/**
 * A link to a clip the library does not have — deleted, or never there.
 *
 * Its own screen rather than a redirect: the clip list now arrives from the
 * server, so a screen that redirects the moment it cannot find a clip throws
 * anyone opening a deep link straight back to the library while the fetch is
 * still in flight.
 */
export function NoSuchClip() {
  const navigate = useNavigate()
  return (
    <div className="stack gap-3" style={{ padding: 32, maxWidth: 420, margin: '0 auto' }}>
      <h2 style={{ margin: 0 }}>That clip isn’t here</h2>
      <div className="card-meta">It may have been removed from the library.</div>
      <button type="button" className="btn btn-primary" onClick={() => navigate('/library')}>
        Back to the library
      </button>
    </div>
  )
}
