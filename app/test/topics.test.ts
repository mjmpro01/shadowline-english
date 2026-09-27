import { describe, expect, it } from 'vitest'
import { iconFor } from '../src/lib/topics'

describe('a clip wears the icon of its topic', () => {
  it('finds the first category it knows', () => {
    expect(iconFor(['chat show'])).toBe('📺')
    expect(iconFor(['interview', 'chat show'])).toBe('💼')
    expect(iconFor(['Daily'])).toBe('🏡')
    expect(iconFor(['IELTS listening'])).toBe('📝')
  })

  it('falls back to a speech bubble for anything else', () => {
    expect(iconFor([])).toBe('💬')
    expect(iconFor(undefined)).toBe('💬')
    expect(iconFor(['astronomy'])).toBe('💬')
  })
})
