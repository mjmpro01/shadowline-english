/**
 * The pictures the game draws, by the names the artist saves them under.
 *
 * Each has a placeholder painted in code (art/placeholder.ts) in the same size
 * and frame layout, so the game is playable without any file here and a file
 * dropped into public/game/ replaces its placeholder with nothing else changed.
 * public/game/README.md is the same list, written for the artist.
 */

export interface AssetSpec {
  key: string
  /** Under public/game/. */
  file: string
  /** Set for spritesheets: the size of one frame. */
  frame?: { w: number; h: number }
}

/** Frames per row of a character sheet, and which row is which. */
export const CHAR_COLS = 4
export const DIRS = ['down', 'up', 'left', 'right'] as const
export type Dir = (typeof DIRS)[number]
export const CHAR_ROWS = {
  idle: 0, // + dir, 2 frames
  walk: 4, // + dir, 4 frames
  hoe: 8, // + dir, 3 frames (the player only)
  harvest: 12, // + dir, 3 frames (the player only)
  sleep: 16, // 2 frames (the player only)
} as const

export const NPC_IDS = ['sir_shadow', 'mira', 'bram'] as const
export const CROP_IDS = ['sprout', 'bloom', 'golden'] as const
/** Growth stages a crop sheet holds: planted, sprout, growing, nearly, ripe. */
export const CROP_STAGES = 5
/** Frames in fx/harvest_pop.png. */
export const POP_FRAMES = 6
/** Frames in fx/dust.png and fx/sleep_z.png. */
export const DUST_FRAMES = 4
export const ZZZ_FRAMES = 3
/** Kinds of tree in objects/tree.png, side by side. */
export const TREE_KINDS = 3
/** The monsters of the woods. A sheet from scripts/build-art.py is four
 *  rows of frames in one strip — standing, moving (or attacking), hit, going
 *  down; the painted stand-in is four frames of it bobbing, used for all. */
export const MONSTER_IDS = ['word_slime', 'echo_bat', 'thorn_mushroom', 'mumble_troll'] as const
export type MonsterId = (typeof MONSTER_IDS)[number]
export const MONSTER_FRAMES = 4
export const MONSTER_ROWS = 4
/** The row each monster moves with: the bat flaps the same way standing or
 *  flying, and the troll stomps as it stands — their second rows are attacks. */
export const MONSTER_MOVE_ROW: Record<MonsterId, number> = {
  word_slime: 1,
  echo_bat: 0,
  thorn_mushroom: 1,
  mumble_troll: 0,
}
/** The row a monster strikes with, in the fight panel. */
export const MONSTER_ATTACK_ROW = 1
export const MONSTER_HURT_ROW = 2
export const MONSTER_DOWN_ROW = 3
/** The slime comes in more colours than its own green; each spot keeps one. */
export const SLIME_COLOURS = ['blue', 'purple'] as const
/** A slime's colour goes with its spot (slime_1 green, slime_2 blue…), so it
 *  is the same one on the map, in the fight, and on each visit. Null for the
 *  monster's own look. */
export function monsterColour(spawn: string, monster: string): (typeof SLIME_COLOURS)[number] | null {
  if (monster !== 'word_slime') return null
  const n = ((Number(spawn.replace(/\D/g, '')) || 1) - 1) % (SLIME_COLOURS.length + 1)
  return n === 0 ? null : SLIME_COLOURS[n - 1]
}

/** Every monster sheet, colours included: key and the monster it draws. */
export const MONSTER_SHEETS: { key: string; id: MonsterId; file: string }[] = [
  ...MONSTER_IDS.map((id) => ({ key: `monster-${id}`, id, file: `monsters/${id}.png` })),
  ...SLIME_COLOURS.map((c) => ({ key: `monster-word_slime-${c}`, id: 'word_slime' as const, file: `monsters/word_slime_${c}.png` })),
]

export const ASSETS: AssetSpec[] = [
  { key: 'player', file: 'characters/player.png', frame: { w: 16, h: 32 } },
  ...NPC_IDS.map((id) => ({ key: `npc-${id}`, file: `characters/${id}.png`, frame: { w: 16, h: 32 } })),
  { key: 'tiles', file: 'tiles/farm.png', frame: { w: 16, h: 16 } },
  { key: 'farmhouse', file: 'objects/farmhouse.png' },
  { key: 'shop_cart', file: 'objects/shop_cart.png' },
  { key: 'workbench', file: 'objects/workbench.png' },
  { key: 'mailbox', file: 'objects/mailbox.png', frame: { w: 16, h: 32 } },
  { key: 'quest_board', file: 'objects/quest_board.png' },
  { key: 'tree', file: 'objects/tree.png', frame: { w: 32, h: 48 } },
  { key: 'rock_big', file: 'objects/rock_big.png' },
  { key: 'bush', file: 'objects/bush.png' },
  { key: 'stump', file: 'objects/stump.png' },
  ...CROP_IDS.map((id) => ({ key: `crop-${id}`, file: `crops/${id}.png`, frame: { w: 16, h: 32 } })),
  { key: 'interact', file: 'fx/interact.png', frame: { w: 16, h: 16 } },
  { key: 'harvest_pop', file: 'fx/harvest_pop.png', frame: { w: 16, h: 16 } },
  { key: 'sparkle', file: 'fx/sparkle.png', frame: { w: 16, h: 16 } },
  { key: 'dust', file: 'fx/dust.png', frame: { w: 16, h: 16 } },
  { key: 'sleep_z', file: 'fx/sleep_z.png', frame: { w: 16, h: 16 } },
  // The colours have no stand-in: without their file a slime is green.
  ...MONSTER_SHEETS.map(({ key, id, file }) => ({
    key,
    file,
    frame: id === 'mumble_troll' ? { w: 48, h: 48 } : { w: 24, h: 24 },
  })),
]

export const BASE = `${import.meta.env.BASE_URL}game/`

/** The pictures' fingerprint from the build (vite.config.ts); empty in tests. */
const VERSION = typeof __GAME_ART__ === 'string' ? __GAME_ART__ : ''

/** A file under public/game/, by a URL that changes when the pictures do, so
 *  a browser never mixes an old picture with a new description of it. */
export function art(file: string): string {
  return VERSION ? `${BASE}${file}?v=${VERSION}` : BASE + file
}

/**
 * Which of the files are actually there.
 *
 * Asked before the game starts so a missing file is a placeholder rather than
 * a broken image. The response's type is checked too: the dev server answers
 * an unknown path with the app's index page.
 */
export async function presentAssets(): Promise<Set<string>> {
  const found = await Promise.all(
    ASSETS.map(async (a) => {
      try {
        const res = await fetch(art(a.file), { method: 'HEAD' })
        return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/') ? a.key : null
      } catch {
        return null
      }
    }),
  )
  return new Set(found.filter((k): k is string => k !== null))
}

/**
 * A character drawn larger than the map's 16px grid, as scripts/build-art.py
 * lays it out: the cell size, how tall the figure stands in it, and where its
 * feet are. The game scales it to the map.
 * `anims` names each animation's frames (idle-down, walk-left, hoe-up,
 * sleep…); without it the rows follow CHAR_ROWS.
 */
export interface CharacterSheet {
  frameWidth: number
  frameHeight: number
  bodyHeight: number
  feet: number
  anims?: Record<string, number[]>
}

async function json<T>(file: string): Promise<T | null> {
  try {
    const res = await fetch(art(file))
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** characters/<id>.json, when that sheet has one; null for a sheet in plain
 *  16×32 frames. */
export async function characterSheet(id: string): Promise<CharacterSheet | null> {
  const sheet = await json<CharacterSheet>(`characters/${id}.json`)
  return sheet && sheet.frameWidth > 0 && sheet.frameHeight > 0 && sheet.bodyHeight > 0 ? sheet : null
}

/**
 * art.json: the pictures are drawn `scale` times the map's resolution (a 16px
 * tile is 64px at 4), and how each strip of frames is cut. Null for pictures
 * at the map's own size, cut as ASSETS says.
 */
export interface ArtManifest {
  scale: number
  frames: Record<string, { w: number; h: number; count: number }>
}

export async function artManifest(): Promise<ArtManifest | null> {
  const manifest = await json<ArtManifest>('art.json')
  return manifest && manifest.scale > 0 && manifest.frames ? manifest : null
}

/**
 * The tileset's names, from tiles/farm_atlas.json: name to tile index. Read so
 * a tileset the artist rearranges still draws the right tiles as long as the
 * names stay, and the size of its cells. Null without an atlas; the defaults
 * in world/farm.ts match the first pack's layout, and so does the placeholder
 * tileset.
 */
export async function tileNames(): Promise<{ names: Record<string, number>; size: number; margin: number; spacing: number } | null> {
  const atlas = await json<{
    tile_size?: number
    margin?: number
    spacing?: number
    atlas_columns: number
    tiles: Record<string, { atlas_x: number; atlas_y: number }>
  }>('tiles/farm_atlas.json')
  if (!atlas) return null
  const names: Record<string, number> = {}
  for (const [name, t] of Object.entries(atlas.tiles)) {
    names[name] = t.atlas_y * atlas.atlas_columns + t.atlas_x
  }
  return { names, size: atlas.tile_size ?? 16, margin: atlas.margin ?? 0, spacing: atlas.spacing ?? 0 }
}
