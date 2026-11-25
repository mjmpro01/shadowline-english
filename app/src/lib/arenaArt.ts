/**
 * The Arena's art, as the artist delivers it: one whole drawing per character
 * under /arena/characters/, described by /arena/manifest.json (see
 * docs/arena-sprites.md).
 *
 * A character may have one pose, a whole sheet of frames, or both: the sheet
 * animates them frame by frame, the pose is drawn still and moved by CSS, and
 * with neither FighterSprite draws its own stand-in in the character's
 * colours — so the Arena works before any art arrives.
 */

export type Animation = 'idle' | 'walk' | 'light' | 'heavy' | 'special' | 'block' | 'hit' | 'ko' | 'win'

/** The moves a sheet has frames for. The others borrow a drawn row (`ALIAS`)
 *  and move by CSS. */
export type DrawnAnimation = 'idle' | 'light' | 'heavy' | 'hit' | 'ko' | 'win' | 'special'



export interface AnimSpec {
  row: number
  frames: number
  fps: number
  /** Loops, or plays once and holds its last frame (a KO stays down). */
  loop?: boolean
}

/**
 * A sheet's rows, top to bottom; its columns are frames. Seven rows of at most
 * four frames, so a 64px sheet is 256 × 448; the last is the character's own
 * skill. Kept identical to the manifest script (app/scripts/arenaManifest.mjs),
 * which writes it into the manifest.
 */
export const SHEET: Record<DrawnAnimation, Required<AnimSpec>> = {
  idle: { row: 0, frames: 4, fps: 6, loop: true },
  light: { row: 1, frames: 4, fps: 14, loop: false },
  heavy: { row: 2, frames: 4, fps: 12, loop: false },
  hit: { row: 3, frames: 2, fps: 10, loop: false },
  ko: { row: 4, frames: 4, fps: 8, loop: false },
  win: { row: 5, frames: 4, fps: 8, loop: true },
  special: { row: 6, frames: 4, fps: 10, loop: false },
}

/** Moves with no row of their own, and the row they are drawn from. */
export const ALIAS: Record<Exclude<Animation, DrawnAnimation>, DrawnAnimation> = {
  walk: 'idle',
  block: 'idle',
}

export interface ArtManifest {
  /** The square frame size, in pixels. */
  frame: number
  /** Pixel art: enlarged with hard square pixels instead of smoothed. */
  pixel?: boolean
  animations: Partial<Record<Animation, AnimSpec>>
  /** A character's layer name ("character/beggar") to its single pose. */
  layers: Record<string, string>
  /** A character's layer name to its sheet of frames, for those that have one. */
  sheets?: Record<string, string>
}

/** Put on every art URL, so a new drawing is fetched on the next deploy. */
export const ART_VERSION = typeof __ARENA_ART__ === 'string' ? __ARENA_ART__ : ''

/** Where a file of the Arena's art is served. */
export function artURL(file: string): string {
  return ART_VERSION ? `/arena/${file}?v=${ART_VERSION}` : `/arena/${file}`
}

let loading: Promise<ArtManifest | null> | null = null

/** The manifest, asked for once; null when there is no art yet. */
export function loadArt(): Promise<ArtManifest | null> {
  loading ??= fetch(artURL('manifest.json'))
    .then((res) => (res.ok ? (res.json() as Promise<ArtManifest>) : null))
    .catch(() => null)
  return loading
}

/** How a fighter is drawn from the art. */
export interface Stack {
  /** Layer names, bottom first: one for a character drawn whole. */
  layers: string[]
  /** Their files, in the same order. */
  files: string[]
  /** There is art to draw. */
  complete: boolean
  /** It is a sheet, so the fighter is animated frame by frame. */
  sheet: boolean
}

type Art = Pick<ArtManifest, 'layers' | 'sheets'>

/** A whole drawing, by its layer name, when there is one: its sheet, else its
 *  pose. */
export function wholeStack(name: string, manifest: Art | null): Stack | null {
  const sheet = manifest?.sheets?.[name]
  if (sheet) return { layers: [name], files: [sheet], complete: true, sheet: true }
  const pose = manifest?.layers[name]
  if (pose) return { layers: [name], files: [pose], complete: true, sheet: false }
  return null
}

/** A character's drawing ("beggar" → character/beggar), or null while there
 *  is none. */
export function characterStack(id: string, manifest: Art | null): Stack | null {
  return wholeStack(`character/${id}`, manifest)
}

/** The frames a move is drawn from: its own row, or the row it borrows. */
export function animationOf(manifest: Pick<ArtManifest, 'animations'>, name: Animation): Required<AnimSpec> {
  const drawn: DrawnAnimation = name in SHEET ? (name as DrawnAnimation) : ALIAS[name as keyof typeof ALIAS]
  const spec = manifest.animations[drawn] ?? manifest.animations[name] ?? SHEET[drawn]
  return { loop: SHEET[drawn].loop, ...spec } as Required<AnimSpec>
}

/** Which frame a move is on, `elapsed` milliseconds after it started. Every
 *  layer of a fighter is drawn at this one frame. */
export function frameAt(elapsed: number, spec: Pick<AnimSpec, 'frames' | 'fps' | 'loop'>): number {
  if (spec.frames <= 1) return 0
  const step = Math.floor((Math.max(0, elapsed) * spec.fps) / 1000)
  return spec.loop === false ? Math.min(step, spec.frames - 1) : step % spec.frames
}
