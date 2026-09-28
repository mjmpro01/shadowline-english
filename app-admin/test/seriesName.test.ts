import { describe, expect, it } from 'vitest'
import { matchSeries, normalise } from '../src/lib/seriesName'

const SERIES = [{ title: 'friends' }, { title: 'Lesson 1' }, { title: 'Tiếng Anh giao tiếp' }]

describe('what a typed series name will do', () => {
  it('joins a series that exists, however it is capitalised or punctuated', () => {
    expect(matchSeries('Friends!', SERIES)).toEqual({ kind: 'existing', series: SERIES[0] })
    expect(matchSeries('  tieng anh  GIAO tiep ', SERIES)).toEqual({ kind: 'existing', series: SERIES[2] })
  })

  it('calls a near miss a probable typo, not a new series', () => {
    expect(matchSeries('fiends', SERIES)).toEqual({ kind: 'similar', series: SERIES[0] })
    expect(matchSeries('freinds', SERIES)).toEqual({ kind: 'similar', series: SERIES[0] })
  })

  it('does not call the next lesson a typo of the last one', () => {
    expect(matchSeries('Lesson 2', SERIES)).toEqual({ kind: 'new' })
  })

  it('starts a new series for a name nothing is close to', () => {
    expect(matchSeries('The Office', SERIES)).toEqual({ kind: 'new' })
    expect(matchSeries('   ', SERIES)).toEqual({ kind: 'empty' })
  })

  it('normalises accents and đ', () => {
    expect(normalise('Đường về nhà')).toBe('duong ve nha')
  })
})
