import type { NpcId } from '../bus'
import {
  HEIGHT,
  TILE,
  WIDTH,
  border,
  grassCell,
  hash,
  inRect,
  pathCell,
  tile,
  type Cell,
  type Rect,
  type TileNames,
} from './farm'

/**
 * Echo Town: south of the farm, a square of stone with a fountain, and the
 * houses of the people who live here, each with its owner at the door.
 *
 * Laid out in 16px tiles like the farm. Each house has its name over the
 * door; without its picture it is the farmhouse in another colour.
 */

/** The gap in the trees on the north edge: back to the farm. */
export const TOWN_GATE: Rect = { x: 16, y: 0, w: 1, h: 1 }
/** Where a player coming from the farm appears: on the road, just inside. */
export const FROM_FARM_TO_TOWN = { x: TOWN_GATE.x * TILE + TILE / 2, y: 2 * TILE + 4 }

/** The square, paved, and the fountain in its middle. */
export const SQUARE: Rect = { x: 8, y: 8, w: 16, h: 8 }
export const FOUNTAIN: Rect = { x: 15, y: 11, w: 2, h: 2 }

export interface Building {
  id: string
  /** Who lives or works there. */
  owner: NpcId
  rect: Rect
  /** A colour for the stand-in house. */
  tint: number
}

/** The houses, each the farmhouse's size: its door is at the middle of its foot. */
export const BUILDINGS: Building[] = [
  { id: 'town_hall', owner: 'elsa', rect: { x: 2, y: 2, w: 5, h: 5 }, tint: 0xd9c7f0 },
  { id: 'clinic', owner: 'vy', rect: { x: 18, y: 2, w: 5, h: 5 }, tint: 0xf4f4f4 },
  { id: 'tower', owner: 'orin', rect: { x: 25, y: 2, w: 5, h: 5 }, tint: 0xb9d0ef },
  { id: 'library', owner: 'lina', rect: { x: 2, y: 12, w: 5, h: 5 }, tint: 0xc7e6cf },
  { id: 'cafe', owner: 'hugo', rect: { x: 25, y: 12, w: 5, h: 5 }, tint: 0xf1d2b0 },
]

/** The Word Hall, north of the square: bigger than the houses, and closed by
 *  the Silence. The Lexi's notes are on its door. */
export const WORD_HALL: Rect = { x: 9, y: 2, w: 6, h: 5 }
/** Where the player stands to read the door: just below it. */
export const HALL_DOOR = { x: WORD_HALL.x + Math.floor(WORD_HALL.w / 2), y: WORD_HALL.y + WORD_HALL.h }

/** A building's door, at the middle of its foot. */
export function door(b: Building): { x: number; y: number } {
  return { x: b.rect.x + Math.floor(b.rect.w / 2), y: b.rect.y + b.rect.h }
}

/** Where each person stands: just beside their door, facing the square. */
export const TOWN_NPCS: { id: NpcId; x: number; y: number }[] = BUILDINGS.map((b) => {
  const d = door(b)
  return { id: b.owner, x: d.x + 1, y: d.y }
})

const PATHS: Rect[] = [
  // Down from the gate to the square.
  { x: 16, y: 0, w: 1, h: 8 },
  // From the Word Hall's door to the square.
  { x: HALL_DOOR.x, y: HALL_DOOR.y, w: 1, h: 1 },
  // From each door to the square: the town hall, the clinic, the tower…
  { x: 4, y: 7, w: 1, h: 2 },
  { x: 4, y: 8, w: 4, h: 1 },
  { x: 20, y: 7, w: 1, h: 1 },
  { x: 27, y: 7, w: 1, h: 2 },
  { x: 24, y: 8, w: 4, h: 1 },
  // …the library and the café.
  { x: 4, y: 17, w: 5, h: 1 },
  { x: 8, y: 16, w: 1, h: 2 },
  { x: 23, y: 17, w: 5, h: 1 },
  { x: 23, y: 16, w: 1, h: 2 },
]

/** The square's furniture: a lamp at each corner, two benches facing the
 *  fountain, and the town's notice board. Clear of every way in. */
export const TOWN_PROPS: { key: 'lamp' | 'bench' | 'notice_board'; rect: Rect }[] = [
  { key: 'lamp', rect: { x: 9, y: 8, w: 1, h: 1 } },
  { key: 'lamp', rect: { x: 22, y: 8, w: 1, h: 1 } },
  { key: 'lamp', rect: { x: 9, y: 15, w: 1, h: 1 } },
  { key: 'lamp', rect: { x: 22, y: 15, w: 1, h: 1 } },
  { key: 'bench', rect: { x: 12, y: 14, w: 2, h: 1 } },
  { key: 'bench', rect: { x: 18, y: 14, w: 2, h: 1 } },
  { key: 'notice_board', rect: { x: 13, y: 8, w: 2, h: 1 } },
]

const isPath = (x: number, y: number) => PATHS.some((p) => inRect(x, y, p))
const isSquare = (x: number, y: number) => inRect(x, y, SQUARE)
const isWater = (x: number, y: number) => inRect(x, y, FOUNTAIN)

/** The ground: grass, paths, the paved square, and — when the fountain is
 *  not drawn standing on the paving — the pond's water in its place. */
export function townGround(names: TileNames, fountainDrawn = false): Cell[][] {
  const pond = (i: number) => ({ index: tile(names, `pond_${i}`) })
  const rows: Cell[][] = []
  for (let y = 0; y < HEIGHT; y++) {
    const row: Cell[] = []
    for (let x = 0; x < WIDTH; x++) {
      if (isWater(x, y) && !fountainDrawn) {
        // Two by two: the pond's four outer corners.
        const top = y === FOUNTAIN.y
        const left = x === FOUNTAIN.x
        row.push(pond(top ? (left ? 5 : 7) : left ? 6 : 8))
      } else if (isSquare(x, y)) row.push({ index: tile(names, names.plaza !== undefined ? 'plaza' : 'stone_path') })
      else if (isPath(x, y)) row.push(pathCell(names, x, y, (a, b) => isPath(a, b) || isSquare(a, b)))
      else row.push(grassCell(names, x + 5, y + 3))
    }
    rows.push(row)
  }
  return rows
}

/** Flowers in the beds by the square, and a few weeds further out. */
export function townDecor(names: TileNames): { x: number; y: number; index: number }[] {
  const flowers = ['flower_white', 'flower_pink', 'flower_purple', 'flower_yellow', 'flower_red']
  const out: { x: number; y: number; index: number }[] = []
  const taken = (x: number, y: number) =>
    isPath(x, y) ||
    isSquare(x, y) ||
    [...BUILDINGS.map((b) => b.rect), WORD_HALL].some((r) => inRect(x, y, { ...r, h: r.h + 1 }))
  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 1; x < WIDTH - 1; x++) {
      if (taken(x, y)) continue
      const h = hash(x * 3 + 1, y * 5 + 2)
      const bySquare = inRect(x, y, { x: SQUARE.x - 1, y: SQUARE.y - 1, w: SQUARE.w + 2, h: SQUARE.h + 2 })
      if (bySquare && h > 0.55) out.push({ x, y, index: tile(names, flowers[Math.floor(h * 100) % flowers.length]) })
      else if (h > 0.93) out.push({ x, y, index: tile(names, 'weeds') })
    }
  }
  return out
}

/** Trees inside the edge, here and there, clear of paths and houses. */
export const TOWN_TREES: { x: number; y: number }[] = [
  { x: 5, y: 10 },
  { x: 27, y: 10 },
  { x: 9, y: 18 },
  { x: 14, y: 19 },
  { x: 20, y: 18 },
  { x: 23, y: 5 },
]

/** What the player cannot walk through. */
export function townSolids(): Rect[] {
  return [
    ...border([TOWN_GATE]),
    FOUNTAIN,
    ...TOWN_PROPS.map((p) => p.rect),
    WORD_HALL,
    ...BUILDINGS.map((b) => b.rect),
    ...TOWN_TREES.map((t) => ({ x: t.x, y: t.y, w: 1, h: 1 })),
  ]
}

/** The edge's trees, for drawing, clear of the gate. */
export function townBorderTrees(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  const nearGate = (x: number, y: number) => y === 0 && Math.abs(x - TOWN_GATE.x) <= 1
  for (let x = 0; x < WIDTH; x += 2) {
    for (const y of [0, HEIGHT - 1]) if (!nearGate(x, y)) out.push({ x, y })
  }
  for (let y = 2; y < HEIGHT - 1; y += 2) out.push({ x: 0, y }, { x: WIDTH - 1, y })
  return out
}
