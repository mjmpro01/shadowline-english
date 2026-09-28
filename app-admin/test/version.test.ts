import { describe, expect, it } from 'vitest'
import { commitOf, isKnown, sameCode } from '../src/lib/version'

describe('comparing the versions the parts report', () => {
  it('treats the same commit as the same code, edits or not', () => {
    expect(sameCode('abc1234', 'abc1234')).toBe(true)
    expect(sameCode('abc1234-dirty', 'abc1234')).toBe(true)
    expect(commitOf('abc1234-dirty')).toBe('abc1234')
  })

  it('tells a part left behind a pull from the rest', () => {
    expect(sameCode('abc1234', '9f00e11')).toBe(false)
  })

  it('never calls an unknown version the same as anything', () => {
    expect(sameCode('unknown', 'unknown')).toBe(false)
    expect(sameCode('', 'abc1234')).toBe(false)
    expect(sameCode(null, 'abc1234')).toBe(false)
    expect(isKnown('')).toBe(false)
    expect(isKnown('abc1234')).toBe(true)
  })
})
