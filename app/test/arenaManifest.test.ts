import { describe, expect, it } from 'vitest'
import { EXPECTED, buildManifest, layerName, pngInfo } from '../scripts/arenaManifest.mjs'

const pose = (path: string, alpha = true) => ({ path, width: 256, height: 256, alpha })
const sheet = (path: string) => ({ path, width: 2560, height: 2304, alpha: true })

describe('the Arena art manifest', () => {
  it('names layers after their files, opponents in the singular', () => {
    expect(layerName('base/a-0.png')).toBe('base/a-0')
    expect(layerName('gear/straw_hat.png')).toBe('gear/straw_hat')
    expect(layerName('opponents/alley_boss.png')).toBe('opponent/alley_boss')
    expect(layerName('gear/Straw Hat.png')).toBeNull()
    expect(layerName('notes.txt')).toBeNull()
  })

  it('makes one pose serve every move', () => {
    const { manifest, mode, errors } = buildManifest([pose('base/a-0.png'), pose('gear/rags.png')])
    expect(errors).toEqual([])
    expect(mode).toBe('pose')
    expect(manifest?.layers).toEqual({ 'base/a-0': 'base/a-0.png', 'gear/rags': 'gear/rags.png' })
    expect(manifest?.animations.ko).toEqual({ row: 0, frames: 1, fps: 1 })
    expect(manifest?.animations.special).toEqual({ row: 0, frames: 1, fps: 1 })
  })

  it('reads full sheets with the rows of the spec', () => {
    const { manifest, mode } = buildManifest([sheet('opponents/tower_master.png')])
    expect(mode).toBe('sheet')
    expect(manifest?.animations.special).toEqual({ row: 4, frames: 10, fps: 14 })
    expect(manifest?.layers['opponent/tower_master']).toBe('opponents/tower_master.png')
  })

  it('takes 64px pixel art, poses or sheets, and marks it to be drawn crisp', () => {
    const small = buildManifest([{ path: 'base/b-1.png', width: 64, height: 64, alpha: true }])
    expect(small.manifest?.frame).toBe(64)
    expect(small.manifest?.pixel).toBe(true)
    expect(small.mode).toBe('pose')
    const sheets = buildManifest([{ path: 'gear/rags.png', width: 640, height: 576, alpha: true }])
    expect(sheets.mode).toBe('sheet')
    expect(sheets.manifest?.frame).toBe(64)
    expect(buildManifest([pose('base/a-0.png')]).manifest?.pixel).toBeUndefined()
  })

  it('refuses frames of different sizes together', () => {
    const mixed = buildManifest([pose('base/a-0.png'), { path: 'hair/a-0.png', width: 64, height: 64, alpha: true }])
    expect(mixed.manifest).toBeNull()
    expect(mixed.errors[0]).toContain('cùng cỡ khung')
  })

  it('refuses a wrong size, and a mix of poses and sheets', () => {
    const wrong = buildManifest([{ path: 'base/a-0.png', width: 1024, height: 1024, alpha: true }])
    expect(wrong.manifest).toBeNull()
    expect(wrong.errors[0]).toContain('1024×1024')
    const mixed = buildManifest([pose('base/a-0.png'), sheet('gear/rags.png')])
    expect(mixed.manifest).toBeNull()
    expect(mixed.errors[0]).toContain('Trộn')
  })

  it('warns about an opaque file and lists what is missing', () => {
    const { warnings, missing } = buildManifest([pose('base/a-0.png', false)])
    expect(warnings.some((w) => w.includes('trong suốt'))).toBe(true)
    expect(missing).toHaveLength(EXPECTED.length - 1)
    expect(missing).toContain('gear/phoenix_feather')
    expect(EXPECTED).toHaveLength(36)
  })

  it('reads a PNG header', () => {
    const header = new Uint8Array(33)
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
    header.set([0, 0, 1, 0, 0, 0, 1, 0, 8, 6], 16)
    expect(pngInfo(header)).toEqual({ width: 256, height: 256, alpha: true })
    expect(pngInfo(new Uint8Array(40))).toBeNull()
  })
})
