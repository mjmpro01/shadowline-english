import type { NpcId } from '../bus'

/**
 * The farm, laid out in 16px tiles.
 *
 * Drawn from a few rectangles and lists rather than a map editor's file; the
 * same numbers can move into Tiled once the town and the woods make the maps
 * big enough to want one. Everything is in tiles: (x, y) is the top-left
 * corner.
 */

export const TILE = 16
export const WIDTH = 32
export const HEIGHT = 22

/**
 * Where each named tile sits in tiles/farm.png, as the delivered atlas lays it
 * out (16 across). tiles/farm_atlas.json overrides these when it is there, so
 * the art can be rearranged by name; the placeholder tileset is painted to the
 * same layout.
 */
export const DEFAULT_TILES: Record<string, number> = {
  grass_1: 0, grass_2: 1, grass_3: 2, grass_4: 3, grass_5: 4,
  bare_dirt: 5, path_vertical: 6, path_horizontal: 7, path_corner: 8, path_cross: 9, stone_path: 10,
  untilled: 23, tilled_dry: 24, tilled_wet: 25, soil_level_1: 26, soil_level_2: 27, soil_level_3: 28,
  soil_locked: 29,
  ...Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`pond_${i}`, 30 + i])),
  fence_horizontal: 46, fence_vertical: 47,
  fence_corner_tl: 48, fence_corner_tr: 49, fence_corner_bl: 50, fence_corner_br: 51,
  fence_post: 52, gate_closed: 53, gate_open: 54,
  small_rock: 55, weeds: 56, mushroom: 57, log: 58, flower_white: 59, flower_pink: 60, flower_purple: 61,
}

export type TileNames = Record<string, number>

export function tile(names: TileNames, name: string): number {
  return names[name] ?? DEFAULT_TILES[name] ?? 0
}

/** A tile to draw: which, and whether it is mirrored (one corner piece serves
 *  for all four corners of a path). */
export interface Cell {
  index: number
  flipX?: boolean
  flipY?: boolean
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** The plots: four across, three down, each two tiles square with a tile of
 *  path between. Index order is left to right, top to bottom — the server's. */
export const PLOT_ORIGIN = { x: 13, y: 10 }
export const PLOT_SIZE = 2
export const PLOT_GAP = 1
export const PLOT_COLS = 4

export function plotRect(idx: number): Rect {
  const col = idx % PLOT_COLS
  const row = Math.floor(idx / PLOT_COLS)
  return {
    x: PLOT_ORIGIN.x + col * (PLOT_SIZE + PLOT_GAP),
    y: PLOT_ORIGIN.y + row * (PLOT_SIZE + PLOT_GAP),
    w: PLOT_SIZE,
    h: PLOT_SIZE,
  }
}

export const HOUSE: Rect = { x: 3, y: 2, w: 5, h: 5 }
/** Where to stand to go inside: the tile below the door. */
export const HOUSE_DOOR = { x: 5, y: 7 }
export const MAILBOX = { x: 9, y: 5 }
export const BOARD: Rect = { x: 10, y: 5, w: 2, h: 2 }
export const CART: Rect = { x: 25, y: 4, w: 3, h: 2 }
export const BENCH: Rect = { x: 26, y: 12, w: 2, h: 2 }
export const POND: Rect = { x: 2, y: 15, w: 6, h: 4 }
/** The fence around the pond, a row of grass inside it along the top, and its
 *  gate, which stands open. */
export const PEN: Rect = { x: 1, y: 13, w: 8, h: 7 }
export const PEN_GATE = { x: 5, y: 13 }
/** Stepping stones from the main path down to the gate. */
const STONES: { x: number; y: number }[] = [9, 10, 11, 12].map((y) => ({ x: PEN_GATE.x, y }))

export const NPCS: { id: NpcId; x: number; y: number }[] = [
  { id: 'sir_shadow', x: 9, y: 10 },
  { id: 'mira', x: 26, y: 6 },
  { id: 'bram', x: 28, y: 14 },
]

/** Where a new farmer appears: just outside the front door. */
export const SPAWN = { x: HOUSE_DOOR.x * TILE + TILE / 2, y: (HOUSE_DOOR.y + 1) * TILE }

/** The gap in the trees at the east end of the main path: the way to the
 *  woods. Walking into it goes there, once the story has opened them. */
export const FARM_GATE: Rect = { x: WIDTH - 1, y: 8, w: 1, h: 1 }
/** Where a player coming back from the woods appears: on the path, just
 *  inside the gate. */
export const FROM_WOODS = { x: (WIDTH - 2) * TILE + TILE / 2, y: (FARM_GATE.y + 1) * TILE }
/** The road south, below the field: the way to Echo Town. */
export const FARM_TOWN_GATE: Rect = { x: 18, y: HEIGHT - 1, w: 1, h: 1 }
/** Where a player coming back from town appears: on the road, just inside. */
export const FROM_TOWN = { x: FARM_TOWN_GATE.x * TILE + TILE / 2, y: (HEIGHT - 1) * TILE - 2 }

/** Decoration that blocks the way, beyond the border of trees. */
export const TREES: { x: number; y: number }[] = [
  { x: 10, y: 1 },
  { x: 16, y: 1 },
  { x: 21, y: 2 },
  { x: 2, y: 9 },
  { x: 29, y: 9 },
  { x: 25, y: 18 },
  { x: 19, y: 19 },
  { x: 11, y: 18 },
]
export const ROCKS: { x: number; y: number }[] = [
  { x: 23, y: 7 },
  { x: 9, y: 16 },
  { x: 29, y: 18 },
  { x: 14, y: 4 },
]

const PATHS: Rect[] = [
  // From the door down to the main path.
  { x: 5, y: 7, w: 1, h: 2 },
  // The main path, east past the cart to the gate to the woods.
  { x: 5, y: 8, w: WIDTH - 5, h: 1 },
  // Down the west side of the field, and along its foot.
  { x: 12, y: 8, w: 1, h: 11 },
  { x: 12, y: 18, w: 13, h: 1 },
  // Out to the carpenter's bench.
  { x: 24, y: 8, w: 1, h: 7 },
  { x: 24, y: 14, w: 3, h: 1 },
  // South from the foot of the field, the road to town.
  { x: 18, y: 18, w: 1, h: 4 },
]

export function inRect(x: number, y: number, r: Rect) {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
}

/** A stable pseudo-random number for a tile, so grass looks the same each visit. */
export function hash(x: number, y: number) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return n - Math.floor(n)
}

const isPath = (x: number, y: number) => PATHS.some((p) => inRect(x, y, p))
const isStone = (x: number, y: number) => STONES.some((s) => s.x === x && s.y === y)
const isWater = (x: number, y: number) => inRect(x, y, POND)

/** A path tile that joins up with the path around it. */
export function pathCell(
  names: TileNames,
  x: number,
  y: number,
  onPath: (x: number, y: number) => boolean = isPath,
): Cell {
  const n = onPath(x, y - 1)
  const s = onPath(x, y + 1)
  const w = onPath(x - 1, y)
  const e = onPath(x + 1, y)
  const links = [n, s, w, e].filter(Boolean).length
  if (links >= 3) return { index: tile(names, 'path_cross') }
  // The corner piece runs north and east; mirrored, it does the other three.
  if ((n || s) && (w || e)) return { index: tile(names, 'path_corner'), flipX: w, flipY: s }
  if (w || e) return { index: tile(names, 'path_horizontal') }
  return { index: tile(names, 'path_vertical') }
}

/** A pond tile with grass edges wherever the water stops: the pond_N pieces
 *  are the middle (0), edges (1-4), outer corners (5-8) and inner corners
 *  (9-12), with 13-15 as more middle for variety. */
function waterCell(names: TileNames, x: number, y: number): Cell {
  const n = !isWater(x, y - 1)
  const s = !isWater(x, y + 1)
  const w = !isWater(x - 1, y)
  const e = !isWater(x + 1, y)
  const pond = (i: number) => ({ index: tile(names, `pond_${i}`) })
  if (n && w) return pond(5)
  if (s && w) return pond(6)
  if (n && e) return pond(7)
  if (s && e) return pond(8)
  if (n) return pond(1)
  if (s) return pond(2)
  if (w) return pond(3)
  if (e) return pond(4)
  if (!isWater(x - 1, y - 1)) return pond(9)
  if (!isWater(x + 1, y - 1)) return pond(10)
  if (!isWater(x - 1, y + 1)) return pond(11)
  if (!isWater(x + 1, y + 1)) return pond(12)
  const h = hash(x, y)
  return pond(h > 0.85 ? 13 + Math.floor((h - 0.85) * 20) : 0)
}

/** Grass, in its few kinds, the same at a spot every visit. */
export function grassCell(names: TileNames, x: number, y: number): Cell {
  const h = hash(x, y)
  const grass = h > 0.9 ? (h > 0.95 ? 'grass_5' : 'grass_4') : `grass_${1 + Math.floor(h * 3.3)}`
  return { index: tile(names, grass) }
}

/** The ground layer: grass, paths, the pond. */
export function ground(names: TileNames): Cell[][] {
  const rows: Cell[][] = []
  for (let y = 0; y < HEIGHT; y++) {
    const row: Cell[] = []
    for (let x = 0; x < WIDTH; x++) {
      if (isWater(x, y)) row.push(waterCell(names, x, y))
      else if (isPath(x, y)) row.push(pathCell(names, x, y))
      else if (isStone(x, y)) row.push({ index: tile(names, 'stone_path') })
      else row.push(grassCell(names, x, y))
    }
    rows.push(row)
  }
  return rows
}

/** Small things scattered on the grass, which the player walks over. */
export function decor(names: TileNames): { x: number; y: number; index: number }[] {
  const kinds = ['flower_white', 'flower_pink', 'flower_purple', 'flower_yellow', 'flower_red', 'mushroom', 'weeds', 'small_rock', 'log']
  const out: { x: number; y: number; index: number }[] = []
  const blocked = (x: number, y: number) =>
    isPath(x, y) ||
    isStone(x, y) ||
    isWater(x, y) ||
    (x === PEN_GATE.x && y === PEN_GATE.y) ||
    solids().some((r) => inRect(x, y, r)) ||
    Array.from({ length: 12 }, (_, i) => plotRect(i)).some((r) => inRect(x, y, { ...r, w: r.w + 1, h: r.h + 1 })) ||
    NPCS.some((n) => Math.abs(n.x - x) + Math.abs(n.y - y) < 2)
  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 1; x < WIDTH - 1; x++) {
      const h = hash(x * 3 + 1, y * 7 + 2)
      if (h > 0.94 && !blocked(x, y)) {
        out.push({ x, y, index: tile(names, kinds[Math.floor((h - 0.94) * 100) % kinds.length]) })
      }
    }
  }
  return out
}

/** The pen's fence, piece by piece: corners, rails, and the open gate. */
export function fence(names: TileNames): { x: number; y: number; index: number; solid: boolean }[] {
  const out: { x: number; y: number; index: number; solid: boolean }[] = []
  const right = PEN.x + PEN.w - 1
  const bottom = PEN.y + PEN.h - 1
  const put = (x: number, y: number, name: string, solid = true) =>
    out.push({ x, y, index: tile(names, name), solid })
  put(PEN.x, PEN.y, 'fence_corner_tl')
  put(right, PEN.y, 'fence_corner_tr')
  put(PEN.x, bottom, 'fence_corner_bl')
  put(right, bottom, 'fence_corner_br')
  for (let x = PEN.x + 1; x < right; x++) {
    if (x === PEN_GATE.x) put(x, PEN.y, 'gate_open', false)
    else put(x, PEN.y, 'fence_horizontal')
    put(x, bottom, 'fence_horizontal')
  }
  for (let y = PEN.y + 1; y < bottom; y++) {
    put(PEN.x, y, 'fence_vertical')
    put(right, y, 'fence_vertical')
  }
  return out
}

/** The edge of a map, as rectangles, with gaps where gates are. */
export function border(gates: Rect[]): Rect[] {
  const edges: Rect[] = []
  for (const y of [0, HEIGHT - 1]) {
    let from = 0
    for (const g of gates.filter((g) => g.y === y).sort((a, b) => a.x - b.x)) {
      edges.push({ x: from, y, w: g.x - from, h: 1 })
      from = g.x + g.w
    }
    edges.push({ x: from, y, w: WIDTH - from, h: 1 })
  }
  for (const x of [0, WIDTH - 1]) {
    let from = 0
    for (const g of gates.filter((g) => g.x === x).sort((a, b) => a.y - b.y)) {
      edges.push({ x, y: from, w: 1, h: g.y - from })
      from = g.y + g.h
    }
    edges.push({ x, y: from, w: 1, h: HEIGHT - from })
  }
  return edges.filter((r) => r.w > 0 && r.h > 0)
}

/** Tiles the player cannot walk into, as rectangles. */
export function solids(): Rect[] {
  return [
    ...border([FARM_GATE, FARM_TOWN_GATE]),
    HOUSE,
    POND,
    CART,
    BENCH,
    BOARD,
    { x: MAILBOX.x, y: MAILBOX.y, w: 1, h: 1 },
    ...TREES.map((t) => ({ x: t.x, y: t.y, w: 1, h: 1 })),
    ...ROCKS.map((r) => ({ ...r, w: 1, h: 1 })),
    ...fence(DEFAULT_TILES)
      .filter((f) => f.solid)
      .map((f) => ({ x: f.x, y: f.y, w: 1, h: 1 })),
  ]
}

/** The trees along the edge of a map, for drawing, clear of its gates. */
export function borderTrees(gates: Rect[] = [FARM_GATE, FARM_TOWN_GATE]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  const nearGate = (x: number, y: number) =>
    gates.some((g) => (g.x === x && Math.abs(g.y - y) <= 1) || (g.y === y && Math.abs(g.x - x) <= 1))
  for (let x = 0; x < WIDTH; x += 2) {
    for (const y of [0, HEIGHT - 1]) if (!nearGate(x, y)) out.push({ x, y })
  }
  for (let y = 2; y < HEIGHT - 1; y += 2) {
    for (const x of [0, WIDTH - 1]) if (!nearGate(x, y)) out.push({ x, y })
  }
  return out
}
