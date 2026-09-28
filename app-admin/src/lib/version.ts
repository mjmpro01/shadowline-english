/**
 * Which code each part of Shadowline runs, and whether they agree.
 *
 * Every part reports a version by the same rule — a pinned SHADOWLINE_VERSION,
 * else the checkout's commit, seven characters, with "-dirty" when tracked
 * files had changes — so two parts built from the same commit report the same
 * thing, and one left running from before a pull reports an older one.
 */

/** Replaced at build time by vite.config.ts (`define`). Absent under vitest,
 *  which is why they are read through typeof. */
declare const __SHADOWLINE_VERSION__: string
declare const __SHADOWLINE_BUILT_AT__: string

/** The console's own version, baked in when it was built. */
export const CONSOLE_VERSION: string =
  typeof __SHADOWLINE_VERSION__ === 'string' ? __SHADOWLINE_VERSION__ : 'unknown'

/** When the console was built, or its dev server started. */
export const CONSOLE_BUILT_AT: string =
  typeof __SHADOWLINE_BUILT_AT__ === 'string' ? __SHADOWLINE_BUILT_AT__ : ''

/** The commit a version names, without the "-dirty" mark: uncommitted edits
 *  on the same commit are the same code as far as "is this one behind" goes,
 *  and parts measure "dirty" slightly differently. */
export function commitOf(version: string): string {
  return version.replace(/-dirty$/, '')
}

/** Whether a version names a commit at all, rather than "unknown" or nothing
 *  (a worker from before workers reported one). */
export function isKnown(version: string | null | undefined): version is string {
  return !!version && version !== 'unknown'
}

/** Whether two parts run the same code. Unknown agrees with nothing. */
export function sameCode(a: string | null | undefined, b: string | null | undefined): boolean {
  return isKnown(a) && isKnown(b) && commitOf(a) === commitOf(b)
}
