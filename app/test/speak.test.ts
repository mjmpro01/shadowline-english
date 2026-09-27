import { describe, expect, it } from 'vitest'
import { sayable } from '../src/lib/speak'

describe('which phrases in an answer can be heard', () => {
  it('English words and sentences can', () => {
    expect(sayable('affect')).toBe(true)
    expect(sayable("I'll be there for you")).toBe(true)
    expect(sayable('break the ice')).toBe(true)
  })

  it('Vietnamese, IPA, numbers and long passages cannot', () => {
    expect(sayable('Mẹo:')).toBe(false)
    expect(sayable('từ vựng toán học')).toBe(false)
    expect(sayable('/ðə/')).toBe(false)
    expect(sayable('44')).toBe(false)
    expect(sayable('a '.repeat(80))).toBe(false)
  })
})
