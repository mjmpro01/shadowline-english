import { describe, expect, it } from 'vitest'
import { clock, cropStage, secondsUntil } from '../src/game/growth'
import {
  DEFAULT_TILES,
  FARM_GATE,
  FARM_TOWN_GATE,
  FROM_TOWN,
  FROM_WOODS,
  TILE,
  ground,
  plotRect,
  solids,
  tile,
  type Rect,
} from '../src/game/world/farm'
import {
  BUILDINGS,
  FROM_FARM_TO_TOWN,
  HALL_DOOR,
  SQUARE,
  TOWN_GATE,
  TOWN_NPCS,
  TOWN_TREES,
  WORD_HALL,
  door,
  townSolids,
} from '../src/game/world/town'
import { giftsInBag, replyKey } from '../src/game/town'
import type { GameState } from '../src/game/api'
import { FROM_FARM, WOODS_GATE, woodsSolids } from '../src/game/world/woods'
import { sameTarget } from '../src/game/bus'
import { monsterColour } from '../src/game/assets'

describe('a crop growing', () => {
  const planted = 1_000_000
  const ripe = planted + 100_000
  it('draws its stages in order and is ripe only when the server says so', () => {
    const stages = [0, 0.2, 0.5, 0.8, 0.99].map((f) => cropStage(planted, ripe, planted + f * 100_000, 5))
    expect(stages).toEqual([0, 0, 2, 3, 3])
    expect(cropStage(planted, ripe, ripe, 5)).toBe(4)
    expect(cropStage(planted, ripe, ripe + 1, 5)).toBe(4)
  })
})

describe('countdowns', () => {
  it('reads as a clock and never goes below zero', () => {
    expect(clock(42)).toBe('0:42')
    expect(clock(725)).toBe('12:05')
    expect(clock(3750)).toBe('1:02:30')
    expect(secondsUntil(new Date(5_000).toISOString(), 1_000)).toBe(4)
    expect(secondsUntil(new Date(1_000).toISOString(), 5_000)).toBe(0)
    expect(secondsUntil(null, 5_000)).toBe(0)
  })
})

describe('the farm map', () => {
  it('keeps every plot clear of walls, and walkable around', () => {
    const blocked = solids()
    for (let idx = 0; idx < 12; idx++) {
      const r = plotRect(idx)
      const hit = blocked.some((b) => r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y)
      expect(hit, `plot ${idx}`).toBe(false)
    }
  })

  it('draws the pond with its edges and the paths joined up', () => {
    const cells = ground(DEFAULT_TILES)
    const indexes = new Set(cells.flat().map((c) => c.index))
    // Pond corners, edges and middle all appear; so do path pieces.
    for (const name of ['pond_0', 'pond_1', 'pond_5', 'pond_8', 'path_horizontal', 'path_vertical', 'path_cross']) {
      expect(indexes.has(tile(DEFAULT_TILES, name)), name).toBe(true)
    }
  })

  it('reads a rearranged tileset by name', () => {
    expect(tile({ grass_1: 99 }, 'grass_1')).toBe(99)
    expect(tile({}, 'grass_1')).toBe(DEFAULT_TILES.grass_1)
  })
})

describe('targets', () => {
  it('are the same when they point at the same thing', () => {
    expect(sameTarget({ kind: 'plot', idx: 1 }, { kind: 'plot', idx: 1 })).toBe(true)
    expect(sameTarget({ kind: 'plot', idx: 1 }, { kind: 'plot', idx: 2 })).toBe(false)
    expect(sameTarget({ kind: 'npc', id: 'mira' }, { kind: 'npc', id: 'bram' })).toBe(false)
    expect(sameTarget(null, null)).toBe(true)
    expect(sameTarget({ kind: 'house' }, null)).toBe(false)
  })
})

describe('the woods', () => {
  const blocks = (rects: Rect[], x: number, y: number) =>
    rects.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h)

  it('leaves room at every monster spot the server has', () => {
    // server/internal/game/monsters.go, Spawns.
    const spawns = [
      [9, 7],
      [15, 12],
      [7, 15],
      [20, 6],
      [24, 15],
      [27, 8],
      [4, 3],
      [17, 18],
      [28, 12],
    ]
    const walls = woodsSolids()
    for (const [x, y] of spawns) expect(blocks(walls, x, y), `spawn ${x},${y}`).toBe(false)
  })

  it('keeps both gates open and lands the player off them', () => {
    expect(blocks(solids(), FARM_GATE.x, FARM_GATE.y)).toBe(false)
    expect(blocks(woodsSolids(), WOODS_GATE.x, WOODS_GATE.y)).toBe(false)
    const tileOf = (p: { x: number; y: number }) => [Math.floor(p.x / TILE), Math.floor((p.y - 1) / TILE)] as const
    expect(blocks(solids(), ...tileOf(FROM_WOODS))).toBe(false)
    expect(blocks(woodsSolids(), ...tileOf(FROM_FARM))).toBe(false)
    expect(blocks([FARM_GATE], ...tileOf(FROM_WOODS))).toBe(false)
    expect(blocks([WOODS_GATE], ...tileOf(FROM_FARM))).toBe(false)
  })
})

describe("a slime's colour", () => {
  it('goes with its spot, the same each time', () => {
    expect(monsterColour('slime_1', 'word_slime')).toBe(null)
    expect(monsterColour('slime_2', 'word_slime')).toBe('blue')
    expect(monsterColour('slime_3', 'word_slime')).toBe('purple')
    expect(monsterColour('slime_4', 'word_slime')).toBe(null)
    expect(monsterColour('bat_1', 'echo_bat')).toBe(null)
  })
})

describe('Echo Town', () => {
  const blocks = (rects: Rect[], x: number, y: number) =>
    rects.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h)
  const tileOf = (p: { x: number; y: number }) => [Math.floor(p.x / TILE), Math.floor((p.y - 1) / TILE)] as const

  it('has a way in from the farm and back', () => {
    expect(blocks(solids(), FARM_TOWN_GATE.x, FARM_TOWN_GATE.y)).toBe(false)
    expect(blocks(townSolids(), TOWN_GATE.x, TOWN_GATE.y)).toBe(false)
    expect(blocks(solids(), ...tileOf(FROM_TOWN))).toBe(false)
    expect(blocks([FARM_TOWN_GATE], ...tileOf(FROM_TOWN))).toBe(false)
    expect(blocks(townSolids(), ...tileOf(FROM_FARM_TO_TOWN))).toBe(false)
    expect(blocks([TOWN_GATE], ...tileOf(FROM_FARM_TO_TOWN))).toBe(false)
  })

  it('leaves everyone standing in the open, by their own door', () => {
    expect(TOWN_NPCS.map((n) => n.id).sort()).toEqual(['elsa', 'hugo', 'lina', 'orin', 'vy'])
    for (const n of TOWN_NPCS) expect(blocks(townSolids(), n.x, n.y), n.id).toBe(false)
    for (const b of BUILDINGS) {
      const d = door(b)
      expect(blocks(townSolids(), d.x, d.y), b.id).toBe(false)
    }
  })

  it('puts the Word Hall clear of the houses, the gate and the trees, its door open to the square', () => {
    const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    for (const b of BUILDINGS) expect(overlaps(WORD_HALL, b.rect), b.id).toBe(false)
    expect(overlaps(WORD_HALL, { ...TOWN_GATE, h: 8 })).toBe(false)
    for (const tree of TOWN_TREES) expect(overlaps(WORD_HALL, { ...tree, w: 1, h: 1 })).toBe(false)
    expect(blocks(townSolids(), HALL_DOOR.x, HALL_DOOR.y)).toBe(false)
    // One step down from the door is the square.
    expect(blocks([SQUARE], HALL_DOOR.x, HALL_DOOR.y + 1)).toBe(true)
  })

  it('finds the gifts in the bag', () => {
    const shop = [
      { id: 'flowers', kind: 'gift', name: { en: 'Flowers', vi: 'Hoa' } },
      { id: 'coffee', kind: 'food', name: { en: 'Coffee', vi: 'Cà phê' } },
      { id: 'old_book', kind: 'gift', name: { en: 'Book', vi: 'Sách' } },
    ] as GameState['shop']
    expect(giftsInBag({ shop, inventory: { flowers: 2, coffee: 3, old_book: 0 } })).toEqual([
      { id: 'flowers', name: { en: 'Flowers', vi: 'Hoa' }, qty: 2 },
    ])
  })

  it('picks a reply with keys 1 to 3', () => {
    expect(replyKey('1', 3)).toBe(0)
    expect(replyKey('3', 3)).toBe(2)
    expect(replyKey('4', 3)).toBe(-1)
    expect(replyKey('x', 3)).toBe(-1)
  })
})
