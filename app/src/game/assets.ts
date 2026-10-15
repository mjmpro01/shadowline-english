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
]

export const BASE = `${import.meta.env.BASE_URL}game/`

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
        const res = await fetch(BASE + a.file, { method: 'HEAD' })
        return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/') ? a.key : null
      } catch {
        return null
      }
    }),
  )
  return new Set(found.filter((k): k is string => k !== null))
}

/**
 * The tileset's names, from tiles/farm_atlas.json: name to tile index. Read so
 * a tileset the artist rearranges still draws the right tiles as long as the
 * names stay. Null without an atlas; the defaults in world/farm.ts match the
 * delivered layout, and so does the placeholder tileset.
 */
export async function tileNames(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(BASE + 'tiles/farm_atlas.json')
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null
    const atlas = (await res.json()) as {
      atlas_columns: number
      tiles: Record<string, { atlas_x: number; atlas_y: number }>
    }
    const out: Record<string, number> = {}
    for (const [name, t] of Object.entries(atlas.tiles)) {
      out[name] = t.atlas_y * atlas.atlas_columns + t.atlas_x
    }
    return out
  } catch {
    return null
  }
}
