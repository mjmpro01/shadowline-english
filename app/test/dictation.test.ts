import { describe, expect, it } from 'vitest'
import { align, autoKind, countErrors, markKey, score, tokens } from '../src/lib/dictation'

const kinds = (typed: string, said: string) => align(typed, said).map((m) => m.kind)

describe('a dictation checked', () => {
  it('reads words without their punctuation or capitals', () => {
    expect(tokens('Good morning, everyone — it’s me!').map((t) => t.word)).toEqual([
      'good',
      'morning',
      'everyone',
      "it's",
      'me',
    ])
  })

  it('keeps numbers, which can be heard wrong too', () => {
    expect(kinds('in 1991', 'In 1990.')).toEqual(['right', 'wrong'])
  })

  it('takes a curly apostrophe for a straight one', () => {
    expect(kinds("it's me", 'It’s me')).toEqual(['right', 'right'])
  })

  it('is all right when every word was heard', () => {
    expect(kinds('good morning everyone', 'Good morning, everyone.')).toEqual(['right', 'right', 'right'])
  })

  it('marks a word left out as missing, in its place', () => {
    const marks = align('I went to shop', 'I went to the shop')
    expect(marks.map((m) => m.kind)).toEqual(['right', 'right', 'right', 'missing', 'right'])
    expect(autoKind(marks[3])).toBe('shortWord')
  })

  it('names an ending dropped or added', () => {
    const marks = align('she walk to work', 'She walks to work')
    expect(marks[1]).toMatchObject({ kind: 'wrong', typed: { word: 'walk' }, expected: { word: 'walks' } })
    expect(autoKind(marks[1])).toBe('missingEnding')
    expect(autoKind(align('we play', 'we played')[1])).toBe('missingEnding')
    expect(autoKind(align('he studies', 'he studied')[1])).toBeNull()
    expect(autoKind(align('they study', 'they studied')[1])).toBe('missingEnding')
  })

  it('leaves the rest for the learner to name', () => {
    const marks = align('the whether is nice', 'the weather is nice')
    expect(marks[1].kind).toBe('wrong')
    expect(autoKind(marks[1])).toBeNull()
  })

  it('shows a word that was never said, and does not count it', () => {
    const marks = align('it is a very cold', 'it is cold')
    expect(marks.map((m) => m.kind)).toEqual(['right', 'right', 'extra', 'extra', 'right'])
    expect(score(marks)).toEqual({ total: 3, right: 3 })
  })

  it('counts nothing written down as nothing heard', () => {
    const marks = align('', 'one two three')
    expect(marks.map((m) => m.kind)).toEqual(['missing', 'missing', 'missing'])
    expect(score(marks)).toEqual({ total: 3, right: 0 })
  })

  it('counts mistakes by the learner’s tag, the word’s own kind, or else as other', () => {
    const chunks = [align('she walk to shop', 'she walks to the shop'), align('the whether', 'the weather')]
    const counts = countErrors(chunks, { [markKey(1, 1)]: 'sound' })
    expect(counts).toEqual({ missingEnding: 1, shortWord: 1, unknownWord: 0, sound: 1, linking: 0, other: 0 })
    expect(countErrors(chunks, {}).other).toBe(1)
  })
})
