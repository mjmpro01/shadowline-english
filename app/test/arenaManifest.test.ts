import { describe, expect, it } from 'vitest'
import {
  CHARACTERS,
  EXPECTED,
  SHEET_ANIMATIONS,
  SHEET_COLUMNS,
  SHEET_ROWS,
  assembleSheet,
  buildManifest,
  checkFrames,
  decodePng,
  encodePng,
  ground,
  layerName,
  parseLayer,
  pngInfo,
} from '../scripts/arenaManifest.mjs'

const pose = (path: string, alpha = true) => ({ path, width: 64, height: 64, alpha })
const sheet = (path: string) => ({ path, width: SHEET_COLUMNS * 64, height: SHEET_ROWS * 64, alpha: true })

/** An empty RGBA image. */
function blank(width: number, height: number) {
  return { width, height, rgba: new Uint8Array(width * height * 4) }
}
/** A 3-pixel-wide figure in one cell, its feet on row `feet` of the cell. */
function figure(image: { width: number; rgba: Uint8Array }, left: number, top: number, feet: number) {
  for (let y = top + 20; y <= top + feet; y++) {
    for (let x = left + 30; x < left + 33; x++) image.rgba.set([200, 150, 100, 255], (y * image.width + x) * 4)
  }
}
/** A sheet with every frame of every row drawn, feet on the ground. */
function fullSheet() {
  const image = blank(SHEET_COLUMNS * 64, SHEET_ROWS * 64)
  for (const { row, frames } of Object.values(SHEET_ANIMATIONS)) {
    for (let c = 0; c < frames; c++) figure(image, c * 64, row * 64, ground(64))
  }
  return image
}

describe('layer names', () => {
  it('names a character after its file, in the singular', () => {
    expect(layerName('characters/beggar.png')).toBe('character/beggar')
    expect(layerName('characters/Thunder Monk.png')).toBeNull()
    // The paper doll's layers are gone.
    expect(layerName('base/a-0.png')).toBeNull()
    expect(layerName('gear/rags@b.png')).toBeNull()
  })

  it('tells a character’s sheet from its single pose', () => {
    expect(parseLayer('characters/beggar.png')).toEqual({ name: 'character/beggar', sheet: false })
    expect(parseLayer('characters/beggar.sheet.png')).toEqual({ name: 'character/beggar', sheet: true })
  })

  it('knows all 24 characters', () => {
    expect(CHARACTERS).toHaveLength(24)
    expect(EXPECTED).toContain('character/tower_master')
  })
})

describe('PNG', () => {
  it('reads back what it writes', () => {
    const image = blank(5, 3)
    image.rgba.set([10, 20, 30, 255, 0, 0, 0, 0, 255, 255, 255, 128], 0)
    const bytes = encodePng(5, 3, image.rgba)
    expect(pngInfo(bytes)).toEqual({ width: 5, height: 3, alpha: true })
    const back = decodePng(bytes)
    expect(back.width).toBe(5)
    expect(Array.from(back.rgba)).toEqual(Array.from(image.rgba))
  })

  it('refuses what is not a PNG', () => {
    expect(pngInfo(new Uint8Array(40))).toBeNull()
    expect(() => decodePng(new Uint8Array(40))).toThrow()
  })
})

describe('the frame grid', () => {
  it('passes a full sheet with the feet on the ground in every frame', () => {
    expect(checkFrames('characters/beggar.png', fullSheet(), 64)).toEqual([])
  })

  it('names a body frame that is missing, or whose feet are off the line', () => {
    const image = fullSheet()
    // Clear light frame 2, and lift heavy frame 1 by four pixels.
    const clear = blank(64, 64)
    for (let y = 0; y < 64; y++) image.rgba.set(clear.rgba.subarray(y * 256, y * 256 + 256), ((64 + y) * image.width + 64) * 4)
    for (let y = 0; y < 64; y++) image.rgba.fill(0, ((128 + y) * image.width) * 4, ((128 + y) * image.width + 64) * 4)
    figure(image, 0, 128, ground(64) - 4)
    const errors = checkFrames('characters/beggar.png', image, 64)
    expect(errors.some((e) => e.includes('light frame 2 trống'))).toBe(true)
    expect(errors.some((e) => e.includes('heavy frame 1 chân ở y=56'))).toBe(true)
  })

  it('lets a KO fall through the air', () => {
    const image = fullSheet()
    const row = SHEET_ANIMATIONS.ko.row * 64
    for (let y = 0; y < 64; y++) image.rgba.fill(0, ((row + y) * image.width + 64) * 4, ((row + y) * image.width + 128) * 4)
    figure(image, 64, row, ground(64) - 4)
    expect(checkFrames('characters/beggar.png', image, 64)).toEqual([])
  })

  it('lets a win jump, but not sink', () => {
    const image = fullSheet()
    const row = SHEET_ANIMATIONS.win.row * 64
    for (let y = 0; y < 64; y++) image.rgba.fill(0, ((row + y) * image.width) * 4, ((row + y) * image.width + 64) * 4)
    figure(image, 0, row, ground(64) - 6)
    expect(checkFrames('characters/beggar.png', image, 64)).toEqual([])
  })

  it('refuses a frame past a row’s count', () => {
    const image = blank(SHEET_COLUMNS * 64, SHEET_ROWS * 64)
    figure(image, 2 * 64, SHEET_ANIMATIONS.hit.row * 64, ground(64)) // hit has 2 frames
    expect(checkFrames('characters/rags.png', image, 64).some((e) => e.includes('hit có hình ở frame 3'))).toBe(true)
  })

  it('lets a skill leap into the air', () => {
    const image = fullSheet()
    const row = SHEET_ANIMATIONS.special.row * 64
    for (let y = 0; y < 64; y++) image.rgba.fill(0, ((row + y) * image.width) * 4, ((row + y) * image.width + 64) * 4)
    figure(image, 0, row, ground(64) - 8)
    expect(checkFrames('characters/beggar.png', image, 64)).toEqual([])
  })

  it('checks a single pose’s feet too', () => {
    const image = blank(64, 64)
    figure(image, 0, 0, 50)
    expect(checkFrames('characters/farmer.png', image, 64)[0]).toContain('tư thế chân ở y=50')
  })
})

describe('assembling frames into a sheet', () => {
  it('puts each frame in its row and column, and names the ones missing', () => {
    const frame = blank(64, 64)
    figure(frame, 0, 0, ground(64))
    const built = assembleSheet(
      [
        { animation: 'idle', index: 1, image: frame },
        { animation: 'ko', index: 4, image: frame },
      ],
      64,
    )
    expect(built.errors).toEqual([])
    expect([built.width, built.height]).toEqual([SHEET_COLUMNS * 64, SHEET_ROWS * 64])
    expect(built.warnings).toContain('thiếu idle-2, để trống')
    const back = { width: built.width, height: built.height, rgba: built.rgba }
    // ko frame 4 sits at column 4 of the ko row.
    const at = ((SHEET_ANIMATIONS.ko.row * 64 + ground(64)) * built.width + 3 * 64 + 31) * 4 + 3
    expect(back.rgba[at]).toBe(255)
  })

  it('refuses a move or frame not in the spec, and a frame of the wrong size', () => {
    const built = assembleSheet(
      [
        { animation: 'dance', index: 1, image: blank(64, 64) },
        { animation: 'hit', index: 3, image: blank(64, 64) },
        { animation: 'idle', index: 1, image: blank(32, 32) },
      ],
      64,
    )
    expect(built.errors).toHaveLength(3)
  })
})

describe('the manifest', () => {
  it('declares a layer’s pose and sheet side by side', () => {
    const { manifest, errors } = buildManifest([pose('characters/beggar.png'), sheet('characters/beggar.sheet.png'), pose('characters/farmer.png')])
    expect(errors).toEqual([])
    expect(manifest?.frame).toBe(64)
    expect(manifest?.pixel).toBe(true)
    expect(manifest?.layers).toEqual({ 'character/beggar': 'characters/beggar.png', 'character/farmer': 'characters/farmer.png' })
    expect(manifest?.sheets).toEqual({ 'character/beggar': 'characters/beggar.sheet.png' })
    expect(manifest?.animations.ko).toEqual(SHEET_ANIMATIONS.ko)
  })

  it('wants a sheet’s size for a .sheet file, and a pose’s for the rest', () => {
    expect(buildManifest([pose('characters/beggar.sheet.png')]).errors[0]).toContain('sheet phải là')
    expect(buildManifest([{ ...sheet('characters/beggar.png') }]).errors[0]).toContain('một tư thế phải là')
  })

  it('refuses a wrong size, and frames of two sizes together', () => {
    expect(buildManifest([{ path: 'characters/beggar.png', width: 1024, height: 1024, alpha: true }]).errors[0]).toContain('1024×1024')
    const mixed = buildManifest([pose('characters/beggar.png'), { path: 'characters/farmer.png', width: 256, height: 256, alpha: true }])
    expect(mixed.manifest).toBeNull()
    expect(mixed.errors[0]).toContain('cùng cỡ khung')
  })

  it('lists the characters still to draw, and those still without a sheet', () => {
    const { missing, missingSheets, warnings } = buildManifest([sheet('characters/beggar.sheet.png'), pose('characters/farmer.png'), pose('characters/nobody.png')])
    expect(missing).not.toContain('character/beggar')
    expect(missing).not.toContain('character/farmer')
    expect(missing).toContain('character/wind_sage')
    expect(missingSheets).toContain('character/farmer')
    expect(missingSheets).not.toContain('character/beggar')
    expect(warnings.some((w) => w.includes('characters/nobody.png'))).toBe(true)
  })

  it('checks the frames of files whose pixels it is given', () => {
    const image = blank(64, 64)
    figure(image, 0, 0, 40)
    const { errors } = buildManifest([{ ...pose('characters/beggar.png'), image }])
    expect(errors[0]).toContain('chân ở y=40')
  })

  it('warns about an opaque file and lists what is missing', () => {
    const { warnings, missing } = buildManifest([pose('characters/beggar.png', false)])
    expect(warnings.some((w) => w.includes('trong suốt'))).toBe(true)
    expect(missing).toHaveLength(EXPECTED.length - 1)
    expect(EXPECTED).toHaveLength(24)
  })
})
