import { describe, expect, it } from 'vitest'
import { known, reading, speakers, topicsOf, turnMillis } from '../src/lib/dialogue'
import type { DialogueSummary } from '../src/repository'

describe('reading a line aloud', () => {
  it('counts the words of the line that were heard', () => {
    const r = reading('can I get a large latte', 'Hi! Can I get a large latte, please?')
    expect(r.total).toBe(8)
    expect(r.heard).toBe(6)
    expect(r.marks.filter((m) => m.kind === 'missing').map((m) => 'expected' in m && m.expected.raw)).toEqual([
      'Hi!',
      'please?',
    ])
  })

  it('does not count words said that the line does not have', () => {
    const r = reading('um so I would like a table for two', 'A table for two.')
    expect(r.heard).toBe(4)
    expect(r.total).toBe(4)
  })

  it('hears nothing in silence', () => {
    expect(reading('', 'Thank you so much!').heard).toBe(0)
  })
})

describe('knowing a dialogue', () => {
  it('knows a line once it has been read the goal’s number of times', () => {
    expect(known(undefined, 5)).toBe(false)
    expect(known({ passes: 4, best: 1 }, 5)).toBe(false)
    expect(known({ passes: 5, best: 0 }, 5)).toBe(true)
  })

  it('lists each topic once, in order', () => {
    const d = (topic: string) => ({ topic }) as DialogueSummary
    expect(topicsOf([d('Food'), d('Travel'), d(''), d('Food'), d('Work')])).toEqual(['Food', 'Travel', 'Work'])
  })

  it('names the two people by the lines they say', () => {
    expect(
      speakers([
        { speaker: 'A', name: 'Barista', text: 'Hi', vi: '' },
        { speaker: 'B', name: 'You', text: 'Hello', vi: '' },
      ]),
    ).toEqual({ A: 'Barista', B: 'You' })
    expect(speakers([])).toEqual({ A: 'A', B: 'B' })
  })

  it('leaves longer for a longer line', () => {
    expect(turnMillis('Thanks a lot.')).toBeLessThan(turnMillis('Would you prefer a window or an aisle seat?'))
  })
})
