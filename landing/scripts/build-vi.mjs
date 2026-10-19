// Writes vi/index.html: index.html with every data-i18n element's contents
// swapped for its Vietnamese, and the head pointed at /vi/. The Vietnamese page
// is real HTML at its own address so search engines can index it; switching
// the text in the browser, as the page used to, is invisible to them.
//
//   node landing/scripts/build-vi.mjs           write vi/index.html
//   node landing/scripts/build-vi.mjs --check   fail if it is out of date
//
// index.html stays the one page edited by hand; run this after changing it.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { meta, text, labels } from './vi.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGIN = 'https://shadowline-english.com'
const source = readFileSync(join(root, 'index.html'), 'utf8')

// Exactly one match, or the build stops: a silent miss would ship English.
function swap(html, from, to) {
  const count = html.split(from).length - 1
  if (count !== 1) throw new Error(`expected one ${JSON.stringify(from)} in index.html, found ${count}`)
  return html.replace(from, () => to)
}

let html = source

// Body: each <tag … data-i18n="key" …>…</tag>. None of them nests an element
// of its own tag, so the first closing tag (prettier may break it as `</a\n>`)
// is the right one.
const seen = new Set()
html = html.replace(
  /<([a-z0-9]+)((?:\s[^>]*?)?\sdata-i18n="([^"]+)"[^>]*)>([\s\S]*?)<\/\1\s*>/g,
  (_, tag, attrs, key) => {
    if (!(key in text)) throw new Error(`no Vietnamese for data-i18n="${key}"`)
    seen.add(key)
    return `<${tag}${attrs}>${text[key]}</${tag}>`
  },
)
const unused = Object.keys(text).filter((key) => !seen.has(key))
if (unused.length) throw new Error(`Vietnamese with no element in index.html: ${unused.join(', ')}`)

html = html.replace(/aria-label="([^"]+)"/g, (whole, label) =>
  label in labels ? `aria-label="${labels[label]}"` : whole,
)

// Head and the page's own links.
const escape = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
html = swap(html, '<html lang="en">', '<html lang="vi">')
html = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(meta.title)}</title>`)
html = html.replace(/(<meta\s+name="description"\s+content=")[^"]*"/, `$1${escape(meta.description)}"`)
html = html.replace(/(<meta property="og:title" content=")[^"]*"/, `$1${escape(meta.title)}"`)
html = html.replace(/(<meta\s+property="og:description"\s+content=")[^"]*"/, `$1${escape(meta.ogDescription)}"`)
html = html.replace(/(<meta property="og:image:alt" content=")[^"]*"/, `$1${escape(meta.ogImageAlt)}"`)
html = swap(html, `<link rel="canonical" href="${ORIGIN}/" />`, `<link rel="canonical" href="${ORIGIN}/vi/" />`)
html = swap(html, `<meta property="og:url" content="${ORIGIN}/" />`, `<meta property="og:url" content="${ORIGIN}/vi/" />`)
html = swap(html, '<meta property="og:locale" content="en_US" />', '<meta property="og:locale" content="vi_VN" />')
html = swap(
  html,
  '<meta property="og:locale:alternate" content="vi_VN" />',
  '<meta property="og:locale:alternate" content="en_US" />',
)
html = swap(
  html,
  '<a href="/" hreflang="en" lang="en" data-lang="en" aria-current="page">EN</a>',
  '<a href="/" hreflang="en" lang="en" data-lang="en">EN</a>',
)
html = swap(
  html,
  '<a href="/vi/" hreflang="vi" lang="vi" data-lang="vi">VI</a>',
  '<a href="/vi/" hreflang="vi" lang="vi" data-lang="vi" aria-current="page">VI</a>',
)
html = html.replace(/<a class="brand" href="\/"/g, '<a class="brand" href="/vi/"')

html = html.replace(
  '<!doctype html>\n',
  '<!doctype html>\n<!-- Generated from ../index.html by scripts/build-vi.mjs. Edit those, not this. -->\n',
)

const out = join(root, 'vi', 'index.html')
if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(out, 'utf8')
  } catch {}
  if (current !== html) {
    console.error('landing/vi/index.html is out of date: run node landing/scripts/build-vi.mjs')
    process.exit(1)
  }
} else {
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, html)
}
