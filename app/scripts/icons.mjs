/**
 * Renders the app's icons from the crest the login screen already wears.
 *
 * Committed rather than run once and forgotten: the icons are the only binary
 * files in this repo that are not a photograph, and a set of PNGs nobody can
 * rebuild is a set of PNGs nobody dares change. Change the crest, run this,
 * and the tab, the home screen and the install prompt all follow.
 *
 *   node scripts/icons.mjs
 *
 * Chromium does the drawing because it is already here for the browser tests,
 * and this box has no image library. It is a screenshot of a div, which is a
 * silly way to resize a picture and the only one available.
 */
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

const SOURCE = 'public/login/crest.png'
const OUT = 'public/icons'

/** The crest's own background, sampled from its corner. */
const BACKDROP = '#81420f'

/**
 * Where the knight sits in the 1024px source, measured rather than guessed —
 * by the span of columns and rows that differ from the backdrop, ignoring the
 * sparkles, which are a handful of pixels each.
 */
const KNIGHT = { x: 259, y: 103, w: 649, h: 834 }
/** Helmet and plume, for the sizes where a whole knight is a smudge. */
const HELM = { x: 300, y: 110, w: 500, h: 560 }

/**
 * How much of the icon's height the subject fills.
 *
 * `maskable` is smaller on purpose: Android crops a maskable icon to whatever
 * shape the launcher likes, and only the middle 80% is guaranteed to survive.
 */
const ICONS = [
  { name: 'icon-192.png', size: 192, subject: KNIGHT, fill: 0.86 },
  { name: 'icon-512.png', size: 512, subject: KNIGHT, fill: 0.86 },
  { name: 'icon-maskable-512.png', size: 512, subject: KNIGHT, fill: 0.62 },
  // iOS rounds the corners and applies no mask of its own, so its home-screen
  // icon gets the whole knight at the size Apple asks for.
  { name: 'apple-touch-icon.png', size: 180, subject: KNIGHT, fill: 0.86 },
  // A whole knight in a browser tab is a smudge, so the tab gets the helmet.
  { name: 'favicon-32.png', size: 32, subject: HELM, fill: 0.94 },
]

const source = 'data:image/png;base64,' + readFileSync(SOURCE).toString('base64')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })

for (const { name, size, subject, fill } of ICONS) {
  const scale = (size * fill) / subject.h
  const centreX = subject.x + subject.w / 2
  const centreY = subject.y + subject.h / 2

  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<style>
       html, body { margin: 0; background: ${BACKDROP}; }
       .icon {
         width: ${size}px; height: ${size}px;
         background-color: ${BACKDROP};
         background-image: url('${source}');
         background-repeat: no-repeat;
         background-size: ${1024 * scale}px ${1024 * scale}px;
         background-position: ${size / 2 - centreX * scale}px ${size / 2 - centreY * scale}px;
       }
     </style><div class="icon"></div>`,
  )
  await page.screenshot({ path: `${OUT}/${name}` })
  await page.close()
  console.log(`${name}  ${size}px`)
}

await browser.close()
