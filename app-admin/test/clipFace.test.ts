import { describe, expect, it } from 'vitest'
import { iconFor, tintOf } from '../src/lib/clipFace'

// The same answers as the learner app's own tests give, so the console's
// preview is the card a learner actually sees.
describe('the clip face, as the learner app draws it', () => {
  it('keeps a clip on one tint, and spreads clips across them', () => {
    expect(tintOf('clip-1')).toBe(tintOf('clip-1'))
    const tints = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(tintOf))
    expect(tints.size).toBeGreaterThan(2)
  })

  it('picks a picture for the topic, and a speech bubble for none', () => {
    expect(iconFor(['interview'])).toBe('💼')
    expect(iconFor(['daily conversation'])).toBe('🏡')
    expect(iconFor([])).toBe('💬')
    expect(iconFor(undefined)).toBe('💬')
  })
})

// Held against the learner app's own functions, so the copy cannot drift.
describe('the copy matches the learner app', async () => {
  const app = {
    ...(await import('../../app/src/lib/score')),
    ...(await import('../../app/src/lib/topics')),
  }
  const ids = ['4f9c', '0b1d-22', 'e2e-clip', 'a'.repeat(36), '7c3e9a10-1111-4222-8333-944455556666']
  const topics = [['interview'], ['chat show'], ['news'], ['song'], ['Travel'], ['misc'], []]

  it('gives every clip the same tint', () => {
    for (const id of ids) expect(tintOf(id)).toBe(app.tintOf(id))
  })

  it('gives every topic the same picture', () => {
    for (const categories of topics) expect(iconFor(categories)).toBe(app.iconFor(categories))
  })
})
