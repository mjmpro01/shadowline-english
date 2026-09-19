import { describe, expect, it } from 'vitest'
import { envelopePath, guideX } from '../src/lib/practiceGuide'

describe('practiceGuide', () => {
  it('maps time onto the strip', () => {
    expect(guideX(0, 2)).toBe(8)
    expect(guideX(2, 2)).toBe(632)
  })

  it('builds a mirrored envelope across the clip', () => {
    const path = envelopePath([0.2, 0.8, 0.4], 1)
    expect(path.startsWith('M')).toBe(true)
    expect(path).toContain('Z')
  })

  it('keeps a short live buffer on the left of a longer clip', () => {
    const path = envelopePath([0.5, 0.9, 0.4], 4, 0.5)
    // First and last x should sit near the start of the strip, not the end.
    const xs = [...path.matchAll(/([\d.]+),/g)].map((m) => Number(m[1]))
    expect(Math.max(...xs)).toBeLessThan(100)
  })
})
