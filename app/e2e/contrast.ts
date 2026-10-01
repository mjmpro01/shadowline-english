import type { Locator } from '@playwright/test'

/**
 * The contrast between an element's text and the solid background behind it,
 * as WCAG computes it (4.5 is what body text needs, 3 large text).
 *
 * Only for text on a flat colour: it takes the nearest ancestor with an opaque
 * background and does not look through gradients or pictures.
 */
export function contrastOf(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 4).map(Number)
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    let bg = [255, 255, 255]
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = rgb(getComputedStyle(e).backgroundColor)
      if (c.length === 3 || (c.length === 4 && c[3] === 1)) {
        bg = c
        break
      }
    }
    const [a, b] = [lum(rgb(getComputedStyle(el).color)), lum(bg)]
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  })
}
