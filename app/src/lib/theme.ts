/**
 * Light, dark, or whatever the device says.
 *
 * Light is the default: the app is for children as much as for adults, and the
 * near-black surface it started with read as heavy to both. The choice is this
 * device's, not the account's — the same person may want dark on a phone at
 * night and light on a classroom screen — so it lives in storage here, and
 * index.html reads it before the first paint so the page never flashes the
 * wrong one.
 */
export type Theme = 'light' | 'dark' | 'system'

export const THEMES: Theme[] = ['light', 'dark', 'system']

const KEY = 'shadowline.theme'
const DARK = '(prefers-color-scheme: dark)'

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'dark' || value === 'system' ? value : 'light'
  } catch {
    // A private window can refuse storage; the default is still a theme.
    return 'light'
  }
}

/** What the page shows for a choice: 'system' resolved against the device. */
function resolved(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return typeof matchMedia === 'function' && matchMedia(DARK).matches ? 'dark' : 'light'
}

function paint(theme: Theme) {
  const root = document.documentElement
  if (resolved(theme) === 'dark') root.dataset.theme = 'dark'
  else delete root.dataset.theme
  // The browser's own chrome — the address bar on a phone — follows too.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved(theme) === 'dark' ? '#201e1d' : '#f7f0e1')
}

let stopFollowing: (() => void) | null = null

/** Applies a theme and remembers it. 'system' keeps following the device. */
export function applyTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* not remembered; still applied */
  }
  stopFollowing?.()
  stopFollowing = null
  paint(theme)
  if (theme === 'system' && typeof matchMedia === 'function') {
    const query = matchMedia(DARK)
    const follow = () => paint('system')
    query.addEventListener('change', follow)
    stopFollowing = () => query.removeEventListener('change', follow)
  }
}

/** Called once at start-up, after index.html has already painted the right
 *  one, so that 'system' goes on following the device from here. */
export function startTheme() {
  const theme = storedTheme()
  if (theme === 'system') applyTheme(theme)
}
