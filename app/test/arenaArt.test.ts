import { describe, expect, it } from 'vitest'
import { SHEET, animationOf, frameAt, stackFor, wholeStack } from '../src/lib/arenaArt'

const look = { body: 'b', skin: 2, hair: 1 }
const named = (...names: string[]) => Object.fromEntries(names.map((n) => [n, `${n}.png`]))

describe('a fighter’s layers', () => {
  it('stacks the body, then the gear in order, then the hair on top', () => {
    const layers = named('base/b-2', 'gear/bare_feet', 'gear/rags', 'gear/straw_hat', 'hair/b-1')
    const stack = stackFor(look, ['bare_feet', 'rags', 'straw_hat'], { layers })
    expect(stack.layers).toEqual(['base/b-2', 'gear/bare_feet', 'gear/rags', 'gear/straw_hat', 'hair/b-1'])
    expect(stack.complete).toBe(true)
    expect(stack.sheet).toBe(false)
  })

  it('is not complete while any layer is missing', () => {
    const stack = stackFor(look, ['rags'], { layers: named('base/b-2', 'hair/b-1') })
    expect(stack.complete).toBe(false)
    expect(stackFor(look, [], null).complete).toBe(false)
  })

  it('wears the body’s own version of an item when there is one', () => {
    const layers = named('base/b-2', 'gear/rags', 'gear/rags@b', 'hair/b-1')
    expect(stackFor(look, ['rags'], { layers }).layers).toContain('gear/rags@b')
    const male = stackFor({ body: 'a', skin: 2, hair: 1 }, ['rags'], { layers: { ...layers, ...named('base/a-2', 'hair/a-1') } })
    expect(male.layers).toContain('gear/rags')
  })

  it('needs the body’s version once an item has only versions per body', () => {
    // rags drawn for the male template only: a female fighter waits for hers.
    const layers = named('base/b-2', 'gear/rags@a', 'hair/b-1')
    expect(stackFor(look, ['rags'], { layers }).complete).toBe(false)
  })

  it('draws back parts behind the body, hair’s first', () => {
    const layers = named('base/b-2', 'gear/twin_blades', 'gear/twin_blades.back', 'hair/b-1', 'hair/b-1.back')
    expect(stackFor(look, ['twin_blades'], { layers }).layers).toEqual([
      'hair/b-1.back',
      'gear/twin_blades.back',
      'base/b-2',
      'gear/twin_blades',
      'hair/b-1',
    ])
  })

  it('animates from the sheets when every layer has one', () => {
    const layers = named('base/b-2', 'gear/rags', 'hair/b-1')
    const sheets = Object.fromEntries(Object.keys(layers).map((n) => [n, `${n}.sheet.png`]))
    const stack = stackFor(look, ['rags'], { layers, sheets })
    expect(stack).toMatchObject({ complete: true, sheet: true })
    expect(stack.files).toEqual(['base/b-2.sheet.png', 'gear/rags.sheet.png', 'hair/b-1.sheet.png'])
  })

  it('keeps the poses while only some layers have sheets', () => {
    // The body moves, the hair does not yet: the fighter stays a still drawing
    // rather than losing the art, or wearing hair that floats off a moving head.
    const layers = named('base/b-2', 'gear/rags', 'hair/b-1')
    const stack = stackFor(look, ['rags'], { layers, sheets: { 'base/b-2': 'base/b-2.sheet.png' } })
    expect(stack).toMatchObject({ complete: true, sheet: false })
    expect(stack.files).toEqual(['base/b-2.png', 'gear/rags.png', 'hair/b-1.png'])
  })

  it('animates a fighter who only has sheets', () => {
    const sheets = named('base/b-2', 'gear/rags', 'hair/b-1')
    expect(stackFor(look, ['rags'], { layers: {}, sheets })).toMatchObject({ complete: true, sheet: true })
  })

  it('takes a whole-character drawing when there is one, its sheet first', () => {
    expect(wholeStack('opponent/alley_boss', { layers: named('opponent/alley_boss') })).toMatchObject({ sheet: false })
    expect(
      wholeStack('opponent/alley_boss', { layers: named('opponent/alley_boss'), sheets: { 'opponent/alley_boss': 'x.sheet.png' } }),
    ).toMatchObject({ sheet: true, files: ['x.sheet.png'] })
    expect(wholeStack('opponent/alley_boss', { layers: {} })).toBeNull()
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
    expect(animationOf(manifest, 'special').row).toBe(SHEET.heavy.row)
    expect(animationOf(manifest, 'ko')).toEqual(SHEET.ko)
  })
})
