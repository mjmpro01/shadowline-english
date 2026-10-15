import Phaser from 'phaser'
import { ASSETS, CHAR_COLS, CHAR_ROWS, CROP_STAGES, DIRS, type Dir } from '../assets'

/**
 * Stand-in art, painted pixel by pixel in code.
 *
 * Every picture the game uses has one here, in the same size and frame layout
 * as the file the artist will deliver, so the game is fully playable now and
 * each real file replaces exactly one of these. Deliberately plain: it is a
 * scaffold for the real art, not an attempt at it.
 */

type Ctx = CanvasRenderingContext2D

function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

/** Makes a canvas texture, lets `draw` paint it, and cuts it into frames. */
function make(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: Ctx) => void,
  frame?: { w: number; h: number },
) {
  const tex = scene.textures.createCanvas(key, w, h)
  if (!tex) return
  const ctx = tex.getContext()
  ctx.imageSmoothingEnabled = false
  draw(ctx)
  tex.refresh()
  if (frame) {
    let i = 0
    for (let y = 0; y + frame.h <= h; y += frame.h) {
      for (let x = 0; x + frame.w <= w; x += frame.w) {
        tex.add(i++, 0, x, y, frame.w, frame.h)
      }
    }
  }
}

// --- People -------------------------------------------------------------------

interface Palette {
  skin: string
  hair: string
  top: string
  bottom: string
  boots: string
  /** Something to tell people apart at a glance: a plume, an apron, a beard. */
  extra?: (ctx: Ctx, ox: number, oy: number, dir: Dir) => void
}

const PEOPLE: Record<string, Palette> = {
  player: { skin: '#f2c9a0', hair: '#5a3a22', top: '#3f7fbf', bottom: '#4a4a6a', boots: '#3a2a1a' },
  sir_shadow: {
    skin: '#f2c9a0',
    hair: '#9aa3ad',
    top: '#b9c2cc',
    bottom: '#7d8792',
    boots: '#4b535c',
    extra: (ctx, ox, oy) => {
      // A helmet, and its red plume.
      px(ctx, ox + 4, oy + 3, 8, 3, '#9aa3ad')
      px(ctx, ox + 7, oy, 3, 4, '#c0392b')
    },
  },
  mira: {
    skin: '#f5d0b0',
    hair: '#c0612b',
    top: '#e58fae',
    bottom: '#6b8f4e',
    boots: '#6b4423',
    extra: (ctx, ox, oy, dir) => {
      if (dir !== 'up') px(ctx, ox + 5, oy + 17, 6, 8, '#f4f1e6') // apron
    },
  },
  bram: {
    skin: '#d9a77c',
    hair: '#3b2a1a',
    top: '#8a5a2b',
    bottom: '#4a4038',
    boots: '#2e2218',
    extra: (ctx, ox, oy, dir) => {
      if (dir !== 'up') px(ctx, ox + 5, oy + 11, 6, 3, '#3b2a1a') // beard
    },
  },
}

/** One 16x32 figure. `step` moves the legs; `crouch` lowers the body. */
function person(
  ctx: Ctx,
  ox: number,
  oy: number,
  p: Palette,
  dir: Dir,
  { step = 0, crouch = 0, armUp = false, eyesShut = false } = {},
) {
  const y = oy + crouch
  // Head and hair.
  px(ctx, ox + 4, y + 4, 8, 8, p.skin)
  px(ctx, ox + 4, y + 3, 8, 3, p.hair)
  if (dir === 'up') px(ctx, ox + 4, y + 3, 8, 7, p.hair)
  if (dir === 'left') px(ctx, ox + 9, y + 3, 3, 6, p.hair)
  if (dir === 'right') px(ctx, ox + 4, y + 3, 3, 6, p.hair)
  // Eyes.
  if (dir !== 'up') {
    const eye = eyesShut ? p.hair : '#1d1d1d'
    const h = eyesShut ? 1 : 2
    if (dir === 'down') {
      px(ctx, ox + 6, y + 7, 1, h, eye)
      px(ctx, ox + 9, y + 7, 1, h, eye)
    } else {
      px(ctx, ox + (dir === 'left' ? 5 : 10), y + 7, 1, h, eye)
    }
  }
  // Body and arms.
  px(ctx, ox + 4, y + 12, 8, 9, p.top)
  if (armUp) px(ctx, ox + (dir === 'left' ? 2 : 12), y + 8, 2, 6, p.skin)
  else {
    px(ctx, ox + 3, y + 13, 1, 6, p.top)
    px(ctx, ox + 12, y + 13, 1, 6, p.top)
  }
  // Legs, which swap as the figure walks.
  const legH = 7 - crouch
  px(ctx, ox + 5, y + 21, 2, legH + (step === 1 ? -1 : 0), p.bottom)
  px(ctx, ox + 9, y + 21, 2, legH + (step === 3 ? -1 : 0), p.bottom)
  px(ctx, ox + 5, oy + 28 + (step === 1 ? -1 : 0), 3, 2, p.boots)
  px(ctx, ox + 8, oy + 28 + (step === 3 ? -1 : 0), 3, 2, p.boots)
  p.extra?.(ctx, ox, y, dir)
}

/** A whole character sheet: the rows and frames characters/*.png must have. */
function characterSheet(ctx: Ctx, p: Palette) {
  const at = (row: number, col: number) => [col * 16, row * 32] as const
  DIRS.forEach((dir, d) => {
    for (let f = 0; f < 2; f++) {
      const [x, y] = at(CHAR_ROWS.idle + d, f)
      person(ctx, x, y + (f === 1 ? 1 : 0), p, dir)
    }
    for (let f = 0; f < 4; f++) {
      const [x, y] = at(CHAR_ROWS.walk + d, f)
      person(ctx, x, y, p, dir, { step: f })
    }
    for (let f = 0; f < 3; f++) {
      const [x, y] = at(CHAR_ROWS.hoe + d, f)
      person(ctx, x, y, p, dir, { armUp: f === 1, crouch: f === 2 ? 1 : 0 })
    }
    for (let f = 0; f < 3; f++) {
      const [x, y] = at(CHAR_ROWS.harvest + d, f)
      person(ctx, x, y, p, dir, { crouch: f === 1 ? 3 : 0, armUp: f === 2 })
    }
  })
  for (let f = 0; f < 2; f++) {
    const [x, y] = at(CHAR_ROWS.sleep, f)
    person(ctx, x, y, p, 'down', { eyesShut: true, crouch: f })
  }
}

// --- Ground ---------------------------------------------------------------------

function speckle(ctx: Ctx, ox: number, oy: number, color: string, seed: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.sin(seed * 31 + i * 17.3) * 10000
    const r = a - Math.floor(a)
    const b = Math.sin(seed * 7 + i * 3.7) * 10000
    const s = b - Math.floor(b)
    px(ctx, ox + Math.floor(r * 15), oy + Math.floor(s * 15), 1, 1, color)
  }
}

/** tiles/farm.png: 16 tiles across, 16px each, in the delivered atlas's order
 *  (world/farm.ts DEFAULT_TILES). Only the tiles the farm draws are painted. */
function tileset(ctx: Ctx) {
  const at = (i: number) => [(i % 16) * 16, Math.floor(i / 16) * 16] as const
  const fill = (i: number, base: string, dots: string, n = 12) => {
    const [x, y] = at(i)
    px(ctx, x, y, 16, 16, base)
    speckle(ctx, x, y, dots, i, n)
  }
  for (let i = 0; i < 5; i++) {
    fill(i, '#7cb342', '#689f38', 10)
    const [x, y] = at(i)
    speckle(ctx, x, y, '#8bc34a', i + 9, 6)
    if (i >= 3) px(ctx, x + 4 + i, y + 6, 2, 2, i === 3 ? '#fff59d' : '#f48fb1')
  }
  fill(5, '#c49a6c', '#a1887f')
  // Paths: dirt down the middle, grass either side.
  const path = (i: number, vertical: boolean, horizontal: boolean, corner = false) => {
    fill(i, '#7cb342', '#689f38', 8)
    const [x, y] = at(i)
    if (vertical) px(ctx, x + 3, y, 10, 16, '#c49a6c')
    if (horizontal) px(ctx, x, y + 3, 16, 10, '#c49a6c')
    if (corner) {
      px(ctx, x + 3, y, 10, 13, '#c49a6c')
      px(ctx, x + 3, y + 3, 13, 10, '#c49a6c')
    }
  }
  path(6, true, false)
  path(7, false, true)
  path(8, false, false, true)
  path(9, true, true)
  fill(10, '#9e9e9e', '#bdbdbd')
  fill(23, '#8d6e63', '#795548')
  for (const [i, base, line] of [
    [24, '#8d6e63', '#6d4c41'],
    [25, '#5d4037', '#4e342e'],
  ] as const) {
    const [x, y] = at(i)
    px(ctx, x, y, 16, 16, base)
    for (let r = 2; r < 16; r += 4) px(ctx, x, y + r, 16, 1, line)
  }
  ;['#6d4c41', '#5d4037', '#4e342e'].forEach((base, l) => {
    const [x, y] = at(26 + l)
    px(ctx, x, y, 16, 16, base)
    for (let r = 2; r < 16; r += 4) px(ctx, x, y + r, 16, 1, '#3e2723')
    ctx.strokeStyle = ['#a1887f', '#ffb74d', '#ffd54f'][l]
    ctx.strokeRect(x + 0.5, y + 0.5, 15, 15)
  })
  {
    const [x, y] = at(29)
    px(ctx, x, y, 16, 16, '#689f38')
    speckle(ctx, x, y, '#33691e', 29, 30)
  }
  // The pond, without edges: every piece is plain water.
  for (let i = 30; i < 46; i++) {
    const [x, y] = at(i)
    px(ctx, x, y, 16, 16, '#4fc3f7')
    px(ctx, x + 2, y + 4, 5, 1, '#b3e5fc')
    px(ctx, x + 9, y + 11, 5, 1, '#b3e5fc')
  }
  const dot = (i: number, color: string) => {
    const [x, y] = at(i)
    px(ctx, x + 6, y + 6, 4, 4, color)
    px(ctx, x + 7, y + 10, 2, 4, '#33691e')
  }
  // Fence: rails and posts in wood, one piece per side and corner.
  const wood = '#8d6e63'
  const rail = (i: number, across: boolean, down: boolean, post = true) => {
    const [x, y] = at(i)
    if (across) {
      px(ctx, x, y + 5, 16, 2, wood)
      px(ctx, x, y + 10, 16, 2, wood)
    }
    if (down) px(ctx, x + 7, y, 2, 16, wood)
    if (post) px(ctx, x + 6, y + 2, 4, 13, '#6d4c41')
  }
  rail(46, true, false)
  rail(47, false, true)
  for (const i of [48, 49, 50, 51]) rail(i, true, true)
  rail(52, false, false)
  rail(53, true, false, false)
  {
    const [x, y] = at(54)
    px(ctx, x, y + 2, 3, 13, '#6d4c41')
    px(ctx, x + 13, y + 2, 3, 13, '#6d4c41')
  }
  {
    const [x, y] = at(55)
    px(ctx, x + 5, y + 8, 6, 5, '#9e9e9e')
    px(ctx, x + 6, y + 8, 3, 1, '#bdbdbd')
  }
  dot(56, '#33691e')
  dot(57, '#e53935')
  {
    const [x, y] = at(58)
    px(ctx, x + 2, y + 8, 12, 5, '#795548')
    px(ctx, x + 12, y + 8, 2, 5, '#d7ccc8')
  }
  dot(59, '#fafafa')
  dot(60, '#f48fb1')
  dot(61, '#ce93d8')
}

// --- Things -------------------------------------------------------------------

function farmhouse(ctx: Ctx) {
  px(ctx, 6, 34, 68, 44, '#d7ccc8') // walls
  px(ctx, 6, 74, 68, 6, '#a1887f')
  for (let y = 0; y < 34; y++) px(ctx, 34 - y, y + 6, 12 + y * 2, 1, '#b71c1c') // roof
  px(ctx, 0, 34, 80, 4, '#7f0000')
  px(ctx, 33, 54, 14, 26, '#6d4c41') // door
  px(ctx, 43, 66, 2, 2, '#ffd54f')
  px(ctx, 12, 46, 14, 12, '#81d4fa') // windows
  px(ctx, 54, 46, 14, 12, '#81d4fa')
  px(ctx, 18, 46, 2, 12, '#5d4037')
  px(ctx, 60, 46, 2, 12, '#5d4037')
}

function cart(ctx: Ctx) {
  px(ctx, 2, 6, 44, 4, '#e57373') // awning
  px(ctx, 2, 10, 44, 2, '#ffffff')
  px(ctx, 4, 12, 40, 12, '#8d6e63')
  px(ctx, 6, 14, 8, 6, '#aed581') // goods
  px(ctx, 18, 14, 8, 6, '#ffcc80')
  px(ctx, 30, 14, 8, 6, '#ce93d8')
  px(ctx, 8, 24, 6, 6, '#3e2723') // wheels
  px(ctx, 34, 24, 6, 6, '#3e2723')
  px(ctx, 4, 2, 2, 8, '#5d4037')
  px(ctx, 42, 2, 2, 8, '#5d4037')
}

function workbench(ctx: Ctx) {
  px(ctx, 2, 10, 28, 6, '#a1887f')
  px(ctx, 4, 16, 3, 14, '#6d4c41')
  px(ctx, 25, 16, 3, 14, '#6d4c41')
  px(ctx, 6, 6, 10, 4, '#bdbdbd') // a saw
  px(ctx, 20, 4, 2, 6, '#6d4c41') // a hammer
  px(ctx, 18, 4, 6, 2, '#9e9e9e')
}

function mailbox(ctx: Ctx) {
  for (const f of [0, 1]) {
    const x = f * 16
    px(ctx, x + 7, 16, 2, 16, '#6d4c41')
    px(ctx, x + 3, 8, 10, 9, '#1565c0')
    px(ctx, x + 3, 8, 10, 2, '#0d47a1')
    if (f === 1) {
      px(ctx, x + 13, 4, 1, 8, '#424242') // flag up: a letter
      px(ctx, x + 13, 4, 3, 3, '#e53935')
    }
  }
}

function questBoard(ctx: Ctx) {
  px(ctx, 4, 20, 3, 12, '#6d4c41')
  px(ctx, 25, 20, 3, 12, '#6d4c41')
  px(ctx, 2, 4, 28, 18, '#8d6e63')
  px(ctx, 4, 6, 24, 14, '#d7ccc8')
  px(ctx, 6, 8, 8, 5, '#fff9c4')
  px(ctx, 17, 9, 8, 6, '#ffe0b2')
  px(ctx, 8, 14, 7, 4, '#e1f5fe')
}

function tree(ctx: Ctx) {
  ;['#2e7d32', '#388e3c', '#1b5e20'].forEach((leaf, k) => {
    const x = k * 32
    px(ctx, x + 13, 30, 6, 18, '#6d4c41')
    ctx.fillStyle = leaf
    ctx.beginPath()
    ctx.arc(x + 16, 18, 15 - k, 0, Math.PI * 2)
    ctx.fill()
    speckle(ctx, x + 6, 6, '#43a047', 9 + k, 20)
  })
}

function rock(ctx: Ctx) {
  px(ctx, 4, 12, 24, 18, '#9e9e9e')
  px(ctx, 8, 8, 16, 6, '#bdbdbd')
  px(ctx, 6, 26, 22, 4, '#757575')
}

function bush(ctx: Ctx) {
  px(ctx, 2, 5, 12, 10, '#388e3c')
  px(ctx, 4, 3, 8, 4, '#43a047')
}

function stump(ctx: Ctx) {
  px(ctx, 3, 8, 10, 7, '#6d4c41')
  px(ctx, 3, 6, 10, 3, '#a1887f')
}

const CROP_COLORS: Record<string, { leaf: string; fruit: string }> = {
  sprout: { leaf: '#66bb6a', fruit: '#ef5350' },
  bloom: { leaf: '#43a047', fruit: '#f06292' },
  golden: { leaf: '#9ccc65', fruit: '#ffd54f' },
}

/** A crop sheet: five 16x32 stages, planted to ripe. */
function crop(ctx: Ctx, id: string) {
  const { leaf, fruit } = CROP_COLORS[id]
  for (let s = 0; s < CROP_STAGES; s++) {
    const x = s * 16
    px(ctx, x + 6, 27, 4, 2, '#4e342e') // a mound
    if (s === 0) {
      px(ctx, x + 7, 25, 2, 2, '#a1887f')
      continue
    }
    const height = [0, 5, 9, 13, 15][s]
    px(ctx, x + 7, 27 - height, 2, height, leaf)
    if (s >= 2) {
      px(ctx, x + 4, 27 - height + 3, 3, 2, leaf)
      px(ctx, x + 9, 27 - height + 5, 3, 2, leaf)
    }
    if (s === 3) px(ctx, x + 6, 27 - height - 2, 4, 3, leaf)
    if (s === 4) {
      px(ctx, x + 5, 27 - height - 4, 6, 6, fruit)
      px(ctx, x + 6, 27 - height - 3, 2, 2, '#ffffff')
    }
  }
}

function interact(ctx: Ctx) {
  for (const f of [0, 1]) {
    const x = f * 16
    const y = f === 1 ? 1 : 0
    px(ctx, x + 4, y + 1, 8, 11, '#fffde7')
    px(ctx, x + 4, y + 1, 8, 1, '#5d4037')
    px(ctx, x + 4, y + 11, 8, 1, '#5d4037')
    px(ctx, x + 7, y + 3, 2, 5, '#e65100')
    px(ctx, x + 7, y + 9, 2, 1, '#e65100')
    px(ctx, x + 7, y + 12, 2, 2, '#fffde7')
  }
}

function harvestPop(ctx: Ctx) {
  for (let f = 0; f < 6; f++) {
    const x = f * 16
    const r = 2 + f * 2
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      px(ctx, x + 7 + dx * Math.min(r, 7), 7 + dy * Math.min(r, 7), 2, 2, f >= 4 ? '#fff59d' : '#ffeb3b')
    }
  }
}

function sparkle(ctx: Ctx) {
  for (let f = 0; f < 4; f++) {
    const x = f * 16
    const r = [1, 2, 3, 2][f]
    px(ctx, x + 7, 7 - r, 2, 2 + r * 2, '#fffde7')
    px(ctx, x + 7 - r, 7, 2 + r * 2, 2, '#fffde7')
  }
}

function dust(ctx: Ctx) {
  for (let f = 0; f < 4; f++) {
    const x = f * 16
    const r = 1 + f
    px(ctx, x + 8 - r, 13 - Math.floor(f / 2), r, r, f === 3 ? '#efebe9' : '#d7ccc8')
    px(ctx, x + 8, 13 - Math.floor(f / 2), r, r, f === 3 ? '#efebe9' : '#d7ccc8')
  }
}

function sleepZ(ctx: Ctx) {
  for (let f = 0; f < 3; f++) {
    const x = f * 16 + 3 + f
    const y = 10 - f * 3
    px(ctx, x, y, 5, 1, '#e3f2fd')
    px(ctx, x + 3, y + 1, 1, 1, '#e3f2fd')
    px(ctx, x + 2, y + 2, 1, 1, '#e3f2fd')
    px(ctx, x + 1, y + 3, 1, 1, '#e3f2fd')
    px(ctx, x, y + 4, 5, 1, '#e3f2fd')
  }
}

const PAINTERS: Record<string, { w: number; h: number; draw: (ctx: Ctx) => void }> = {
  player: { w: 16 * CHAR_COLS, h: 32 * 17, draw: (c) => characterSheet(c, PEOPLE.player) },
  // People other than the player only stand and walk: eight rows.
  'npc-sir_shadow': { w: 16 * CHAR_COLS, h: 32 * 8, draw: (c) => characterSheet(c, PEOPLE.sir_shadow) },
  'npc-mira': { w: 16 * CHAR_COLS, h: 32 * 8, draw: (c) => characterSheet(c, PEOPLE.mira) },
  'npc-bram': { w: 16 * CHAR_COLS, h: 32 * 8, draw: (c) => characterSheet(c, PEOPLE.bram) },
  tiles: { w: 256, h: 64, draw: tileset },
  farmhouse: { w: 80, h: 80, draw: farmhouse },
  shop_cart: { w: 48, h: 32, draw: cart },
  workbench: { w: 32, h: 32, draw: workbench },
  mailbox: { w: 32, h: 32, draw: mailbox },
  quest_board: { w: 32, h: 32, draw: questBoard },
  tree: { w: 96, h: 48, draw: tree },
  rock_big: { w: 32, h: 32, draw: rock },
  bush: { w: 16, h: 16, draw: bush },
  stump: { w: 16, h: 16, draw: stump },
  'crop-sprout': { w: 80, h: 32, draw: (c) => crop(c, 'sprout') },
  'crop-bloom': { w: 80, h: 32, draw: (c) => crop(c, 'bloom') },
  'crop-golden': { w: 80, h: 32, draw: (c) => crop(c, 'golden') },
  interact: { w: 32, h: 16, draw: interact },
  harvest_pop: { w: 96, h: 16, draw: harvestPop },
  sparkle: { w: 64, h: 16, draw: sparkle },
  dust: { w: 64, h: 16, draw: dust },
  sleep_z: { w: 48, h: 16, draw: sleepZ },
}

/** Paints a placeholder for every picture the artist has not delivered yet. */
export function paintPlaceholders(scene: Phaser.Scene, present: Set<string>) {
  for (const asset of ASSETS) {
    if (present.has(asset.key) || scene.textures.exists(asset.key)) continue
    const painter = PAINTERS[asset.key]
    if (painter) make(scene, asset.key, painter.w, painter.h, painter.draw, asset.frame)
  }
}
