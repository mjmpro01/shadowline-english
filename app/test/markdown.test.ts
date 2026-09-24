import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown } from '../src/lib/markdown'

describe('parseInline', () => {
  it('finds bold, italic and code', () => {
    expect(parseInline('Stress **there**, not *here*, as in `/ðɛr/`.')).toEqual([
      { kind: 'text', text: 'Stress ' },
      { kind: 'bold', text: 'there' },
      { kind: 'text', text: ', not ' },
      { kind: 'italic', text: 'here' },
      { kind: 'text', text: ', as in ' },
      { kind: 'code', text: '/ðɛr/' },
      { kind: 'text', text: '.' },
    ])
  })

  it('leaves a lone asterisk as text', () => {
    expect(parseInline('5 * 3 = 15')).toEqual([{ kind: 'text', text: '5 * 3 = 15' }])
  })

  // The point of parsing into data: what the model writes is shown, never run.
  it('treats markup as text', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([
      { kind: 'text', text: '<img src=x onerror=alert(1)>' },
    ])
  })
})

describe('parseMarkdown', () => {
  it('splits paragraphs on blank lines and keeps line breaks inside one', () => {
    const blocks = parseMarkdown('First line\nsecond line\n\nNew paragraph')
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ kind: 'paragraph' })
    expect(blocks[0].kind === 'paragraph' && blocks[0].lines).toHaveLength(2)
  })

  it('reads bulleted and numbered lists', () => {
    const blocks = parseMarkdown('Try this:\n- **th** in *three*\n- final **t**\n\n1. listen\n2. repeat')
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'list', 'list'])
    expect(blocks[1]).toMatchObject({ kind: 'list', ordered: false })
    expect(blocks[2]).toMatchObject({ kind: 'list', ordered: true })
    expect(blocks[2].kind === 'list' && blocks[2].items).toHaveLength(2)
  })

  it('reads a heading it was asked not to write as a bold line', () => {
    expect(parseMarkdown('## Tips')).toEqual([
      { kind: 'paragraph', lines: [[{ kind: 'bold', text: 'Tips' }]] },
    ])
  })
})
