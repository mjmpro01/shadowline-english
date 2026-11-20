import { describe, expect, it } from 'vitest'
import { layersFor } from '../src/lib/arenaArt'

describe('a fighter’s layers', () => {
  it('stacks the body, then the gear in order, then the hair on top', () => {
    expect(layersFor('b', 2, 1, ['bare_feet', 'rags', 'straw_hat'])).toEqual([
      'base/b-2',
      'gear/bare_feet',
      'gear/rags',
      'gear/straw_hat',
      'hair/b-1',
    ])
  })
})
