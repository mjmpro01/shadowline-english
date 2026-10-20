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
 * The Whispering Woods: east of the farm, where the monsters are.
 *
 * Laid out like the farm, in 16px tiles. Where the monsters live comes from
 * the server (state.spawns), which decides every fight; the paths here are
 * drawn to pass by those places.
 */

/** The gap in the trees on the west edge: back to the farm. */
export const WOODS_GATE: Rect = { x: 0, y: 11, w: 1, h: 1 }
/** Where a player coming from the farm appears: on the path, just inside. */
export const FROM_FARM = { x: TILE + TILE / 2, y: (WOODS_GATE.y + 1) * TILE }

const PATHS: Rect[] = [
  // In from the gate and across.
  { x: 0, y: 11, w: 26, h: 1 },
  // North to the slimes' clearing, south to the bats' hollow.
  { x: 12, y: 4, w: 1, h: 15 },
  { x: 12, y: 4, w: 10, h: 1 },
  { x: 22, y: 4, w: 1, h: 13 },
  { x: 22, y: 16, w: 4, h: 1 },
  { x: 5, y: 16, w: 8, h: 1 },
  { x: 22, y: 8, w: 6, h: 1 },
]

/** Clearings around where monsters live, kept free of trees. Matches the
 *  server's game.Spawns, with room to wander. */
export const CLEARINGS: Rect[] = [
  { x: 7, y: 5, w: 5, h: 4 },
  { x: 14, y: 11, w: 4, h: 4 },
  { x: 5, y: 13, w: 5, h: 5 },
  { x: 18, y: 5, w: 4, h: 3 },
  { x: 23, y: 14, w: 4, h: 4 },
  { x: 25, y: 6, w: 4, h: 4 },
]

const isPath = (x: number, y: number) => PATHS.some((p) => inRect(x, y, p))
const isClear = (x: number, y: number) =>
  isPath(x, y) || CLEARINGS.some((c) => inRect(x, y, { x: c.x - 1, y: c.y - 1, w: c.w + 2, h: c.h + 2 }))

/** The woods' trees: two rows deep along the edge, and stands of them
 *  wherever the paths and clearings are not. */
export const WOOD_TREES: { x: number; y: number }[] = (() => {
  const out: { x: number; y: number }[] = []
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (inRect(x, y, WOODS_GATE) || (x <= 1 && Math.abs(y - WOODS_GATE.y) <= 1)) continue
      const edge = x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1
      const inner = x === 1 || y === 1 || x === WIDTH - 2 || y === HEIGHT - 2
      if ((edge && (x + y) % 2 === 0) || (inner && (x + y) % 2 === 1 && !isClear(x, y))) {
        out.push({ x, y })
        continue
      }
      if (edge || inner || isClear(x, y)) continue
      if (hash(x * 5 + 3, y * 3 + 1) > 0.72 && (x + y * 3) % 2 === 0) out.push({ x, y })
    }
  }
  return out
})()

/** The ground: grass and its paths. */
export function woodsGround(names: TileNames): Cell[][] {
  const rows: Cell[][] = []
  for (let y = 0; y < HEIGHT; y++) {
    const row: Cell[] = []
    for (let x = 0; x < WIDTH; x++) {
      row.push(isPath(x, y) ? pathCell(names, x, y, isPath) : grassCell(names, x + 11, y + 7))
    }
    rows.push(row)
  }
  return rows
}

/** Mushrooms, logs and weeds: more of them than on the farm, and no flowers. */
export function woodsDecor(names: TileNames): { x: number; y: number; index: number }[] {
  const kinds = ['mushroom', 'weeds', 'log', 'small_rock', 'weeds', 'mushroom']
  const out: { x: number; y: number; index: number }[] = []
  const trees = new Set(WOOD_TREES.map((t) => `${t.x},${t.y}`))
  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 1; x < WIDTH - 1; x++) {
      const h = hash(x * 7 + 5, y * 11 + 3)
      if (h > 0.9 && !isPath(x, y) && !trees.has(`${x},${y}`)) {
        out.push({ x, y, index: tile(names, kinds[Math.floor((h - 0.9) * 100) % kinds.length]) })
      }
    }
  }
  return out
}

/** What the player cannot walk through. */
export function woodsSolids(): Rect[] {
  return [...border([WOODS_GATE]), ...WOOD_TREES.map((t) => ({ x: t.x, y: t.y, w: 1, h: 1 }))]
}
