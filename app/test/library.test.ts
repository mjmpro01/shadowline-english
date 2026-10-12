import { describe, expect, it } from 'vitest'
import { pageNumbers } from '../src/lib/library'

const shown = (page: number, pages: number) =>
  pageNumbers(page, pages)
    .map((n) => (n === null ? '…' : String(n)))
    .join(' ')

describe('pageNumbers', () => {
  it('shows every page when there are few', () => {
    expect(shown(1, 1)).toBe('1')
    expect(shown(2, 3)).toBe('1 2 3')
    expect(shown(7, 7)).toBe('1 2 3 4 5 6 7')
  })

  it('keeps the first, the last and the neighbours of the current page', () => {
    expect(shown(5, 12)).toBe('1 … 4 5 6 … 12')
  })

  it('slides the window at either end rather than leave a short row', () => {
    expect(shown(1, 12)).toBe('1 2 3 4 5 … 12')
    expect(shown(2, 12)).toBe('1 2 3 4 5 … 12')
    expect(shown(12, 12)).toBe('1 … 8 9 10 11 12')
    expect(shown(11, 12)).toBe('1 … 8 9 10 11 12')
  })

  it('never shows more than seven slots, or a page twice', () => {
    for (let pages = 1; pages <= 40; pages++) {
      for (let page = 1; page <= pages; page++) {
        const row = pageNumbers(page, pages)
        expect(row.length).toBeLessThanOrEqual(7)
        const numbers = row.filter((n): n is number => n !== null)
        expect(new Set(numbers).size).toBe(numbers.length)
        expect(numbers).toContain(page)
        expect(numbers[0]).toBe(1)
        expect(numbers[numbers.length - 1]).toBe(pages)
      }
    }
  })

  it('treats a page out of range as the nearest end', () => {
    expect(shown(0, 12)).toBe('1 2 3 4 5 … 12')
    expect(shown(99, 12)).toBe('1 … 8 9 10 11 12')
  })
})
