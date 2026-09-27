/**
 * Light or dark, as chosen in the learner app.
 *
 * The console has no picker of its own: it is on the same origin, so it reads
 * the choice the learner app stores (Profile → Theme) and shows the same one.
 * index.html applies it before the first paint; this keeps 'system' following
 * the device after that.
 */
const KEY = 'shadowline.theme'
const DARK = '(prefers-color-scheme: dark)'

function paint(dark: boolean) {
  if (dark) document.documentElement.dataset.theme = 'dark'
  else delete document.documentElement.dataset.theme
}

export function startTheme() {
  let theme: string | null = null
  try {
    theme = localStorage.getItem(KEY)
  } catch {
    // A private window can refuse storage; light is still a theme.
  }
  if (theme !== 'system' || typeof matchMedia !== 'function') return
  const query = matchMedia(DARK)
  paint(query.matches)
  query.addEventListener('change', () => paint(query.matches))
}
