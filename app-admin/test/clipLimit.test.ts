import { describe, expect, it } from 'vitest'
import { isOverLong, overLongSelected } from '../src/lib/clipLimit'

// Moved here from the studio's browser test: the lesson that test records is
// sixteen seconds long, and since a clip may run to six minutes no merge of
// its lines can be too long any more.
describe('an over-long clip', () => {
  const segments = [
    { start: 0, end: 400 },
    { start: 400, end: 410 },
    { start: 410, end: 770.005 },
  ]

  it('is one past the limit, not one at it', () => {
    expect(isOverLong({ start: 0, end: 360 }, 360)).toBe(false)
    expect(isOverLong({ start: 0, end: 360.005 }, 360)).toBe(false)
    expect(isOverLong({ start: 0, end: 361 }, 360)).toBe(true)
  })

  it('blocks publishing only while it is selected', () => {
    expect(overLongSelected(segments, () => true, 360)).toBe(1)
    expect(overLongSelected(segments, (i) => i !== 0, 360)).toBe(0)
    expect(overLongSelected(segments, () => false, 360)).toBe(0)
  })
})
