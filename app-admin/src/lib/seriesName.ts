/**
 * What a series name typed in the studio will do: join a series that exists,
 * or start a new one — and whether the new one is probably a typo for one
 * that exists.
 *
 * A series is found by its name when a batch is published, so "fiends" for
 * "friends" does not fail: it quietly makes a second series, and the library
 * shows the same recording twice under two names. This is what says so before
 * publishing, while it is one click to fix.
 */

/** Lower case, no accents, no punctuation, single spaces: "Friends!" and
 *  " friends " are the same series, and so are "Tiếng Anh" and "tieng anh". */
export function normalise(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Edits to turn one string into the other. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return row[b.length]
}

export type SeriesMatch<T> =
  | { kind: 'empty' }
  | { kind: 'existing'; series: T }
  | { kind: 'similar'; series: T }
  | { kind: 'new' }

/**
 * How close is close enough to be a typo: one edit in a short name, two in a
 * longer one. "fiends" is one edit from "friends"; "Lesson 1" and "Lesson 2"
 * are one edit apart too, which is why a name ending in a different number is
 * never called a typo — those are the next lesson, on purpose.
 */
function looksLikeTypo(typed: string, existing: string): boolean {
  if (typed.length < 3) return false
  const trailing = /(\d+)$/
  const a = typed.match(trailing)?.[1]
  const b = existing.match(trailing)?.[1]
  if (a !== undefined && b !== undefined && a !== b) return false
  const allowed = Math.max(typed.length, existing.length) <= 6 ? 1 : 2
  return distance(typed, existing) <= allowed
}

export function matchSeries<T extends { title: string }>(typed: string, series: T[]): SeriesMatch<T> {
  const name = normalise(typed)
  if (!name) return { kind: 'empty' }
  const same = series.find((s) => normalise(s.title) === name)
  if (same) return { kind: 'existing', series: same }
  const close = series.find((s) => looksLikeTypo(name, normalise(s.title)))
  if (close) return { kind: 'similar', series: close }
  return { kind: 'new' }
}
