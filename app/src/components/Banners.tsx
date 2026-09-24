import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useRemote } from '../lib/remote'
import { repository } from '../repository'
import type { Banner } from '../data/types'
import { Icon } from './Icon'

/** Where the dismissed banners are remembered, per browser. */
const DISMISSED = 'shadowline.dismissedBanners'

/** Reading storage can throw in a private window; a browser that will not
 *  remember a dismissal shows the banner again, which is the right way to fail. */
function dismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED)
    const ids: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function remember(ids: string[]) {
  try {
    // The last fifty: enough for every banner that could be live at once, and
    // a list that cannot grow for as long as the app is used.
    localStorage.setItem(DISMISSED, JSON.stringify(ids.slice(-50)))
  } catch {
    /* the banner comes back next time; nothing is lost */
  }
}

/**
 * The announcements an admin has put on this screen.
 *
 * Nothing at all when there are none, or when they have not loaded: a banner is
 * never the reason a screen looks broken. A learner can close one, and it stays
 * closed in this browser.
 */
export function Banners({ placement }: { placement: 'dashboard' | 'library' }) {
  const { t, locale } = useI18n()
  const remote = useRemote(`${placement}:${locale}`, () => repository.banners(placement, locale))
  const [closed, setClosed] = useState<string[]>(dismissed)

  if (remote.state !== 'ready') return null
  const showing = remote.value.filter((banner) => !closed.includes(banner.id))
  if (showing.length === 0) return null

  const close = (id: string) => {
    const next = [...closed, id]
    setClosed(next)
    remember(next)
  }

  return (
    <div className="stack gap-2">
      {showing.map((banner) => (
        <section key={banner.id} className="banner" aria-label={banner.title}>
          {banner.imageUrl && <img className="banner-image" src={banner.imageUrl} alt="" />}
          <div className="banner-text">
            <div className="banner-title">{banner.title}</div>
            {banner.body && <p className="banner-body">{banner.body}</p>}
            {banner.linkUrl && <BannerLink banner={banner} />}
          </div>
          <button
            type="button"
            className="banner-close"
            aria-label={t('banner.close')}
            title={t('banner.close')}
            onClick={() => close(banner.id)}
          >
            <Icon name="x" size={16} />
          </button>
        </section>
      ))}
    </div>
  )
}

/** A path inside the app is a route change; an address outside it opens beside
 *  the app rather than instead of it. */
function BannerLink({ banner }: { banner: Banner }) {
  if (banner.linkUrl.startsWith('/')) {
    return (
      <Link className="btn btn-primary banner-link" to={banner.linkUrl}>
        {banner.linkLabel}
      </Link>
    )
  }
  return (
    <a className="btn btn-primary banner-link" href={banner.linkUrl} target="_blank" rel="noopener noreferrer">
      {banner.linkLabel}
    </a>
  )
}
