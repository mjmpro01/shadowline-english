import { describe, expect, it } from 'vitest'
import { SHEET, animationOf, characterStack, frameAt, wholeStack } from '../src/lib/arenaArt'

const named = (...names: string[]) => Object.fromEntries(names.map((n) => [n, `${n}.png`]))

describe('a character’s drawing', () => {
  it('is its sheet when there is one, else its single pose', () => {
    const layers = named('character/beggar', 'character/farmer')
    const sheets = { 'character/beggar': 'characters/beggar.sheet.png' }
    expect(characterStack('beggar', { layers, sheets })).toMatchObject({ sheet: true, files: ['characters/beggar.sheet.png'] })
    expect(characterStack('farmer', { layers, sheets })).toMatchObject({ sheet: false, files: ['character/farmer.png'] })
  })

  it('is nothing until it is drawn: the stand-in is drawn instead', () => {
    expect(characterStack('wind_sage', { layers: {} })).toBeNull()
    expect(characterStack('wind_sage', null)).toBeNull()
  })

  it('is the same whole drawing by its layer name', () => {
    expect(wholeStack('character/beggar', { layers: named('character/beggar') })).toMatchObject({ complete: true, sheet: false })
  })
})

describe('the frame clock', () => {
  it('loops a looping move', () => {
    const idle = SHEET.idle
    const frame = 1000 / idle.fps
    expect([0, 1, 2, 3, 4, 5].map((n) => frameAt(n * frame + 1, idle))).toEqual([0, 1, 2, 3, 0, 1])
  })

  it('plays a move once and holds its last frame', () => {
    const ko = SHEET.ko
    expect(frameAt(10_000, ko)).toBe(ko.frames - 1)
    expect(frameAt(0, ko)).toBe(0)
  })

  it('stays on the one frame of a single pose', () => {
    expect(frameAt(5_000, { frames: 1, fps: 1 })).toBe(0)
  })

  it('borrows a drawn row for moves that have none', () => {
    const manifest = { animations: SHEET }
    expect(animationOf(manifest, 'walk').row).toBe(SHEET.idle.row)
    expect(animationOf(manifest, 'block').row).toBe(SHEET.idle.row)
    // A character's skill has its own row, the last.
    expect(animationOf(manifest, 'special')).toEqual(SHEET.special)
    expect(SHEET.special.row).toBe(6)
    expect(animationOf(manifest, 'ko')).toEqual(SHEET.ko)
  })
})
