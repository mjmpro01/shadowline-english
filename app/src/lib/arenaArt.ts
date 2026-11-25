/**
 * The Arena's art, as the artist delivers it: layers under /arena/, described
 * by /arena/manifest.json (see docs/arena-sprites.md).
 *
 * A fighter is a paper doll — a body, the gear worn, the hair — and the art is
 * frame-synchronised: every layer of a fighter is drawn on the same canvas, in
 * the same pose, with the same frames in the same cells of its sheet, so one
 * clock can step them all together and a sword is always in the hand that
 * holds it. A layer may have one pose, a whole sheet, or both: a fighter is
 * animated from the sheets when every one of their layers has one, drawn from
 * the poses when every layer has one of those, and by FighterSprite's own
 * stand-in otherwise — so the Arena works before any art arrives, and a sheet
 * landing for one layer never takes the art away from anybody.
 */

export type Animation = 'idle' | 'walk' | 'light' | 'heavy' | 'special' | 'block' | 'hit' | 'ko' | 'win'

/** The moves a sheet has frames for. The others borrow a drawn row (`ALIAS`)
 *  and move by the stand-in's CSS motion. */
export type DrawnAnimation = 'idle' | 'light' | 'heavy' | 'hit' | 'ko' | 'win'

export interface AnimSpec {
  row: number
  frames: number
  fps: number
  /** Loops, or plays once and holds its last frame (a KO stays down). */
  loop?: boolean
}

/**
 * A sheet's rows, top to bottom; its columns are frames. Six rows of at most
 * four frames, so a 64px sheet is 256 × 384. Kept identical to the manifest
 * script (app/scripts/arenaManifest.mjs), which writes it into the manifest.
 */
export const SHEET: Record<DrawnAnimation, Required<AnimSpec>> = {
  idle: { row: 0, frames: 4, fps: 6, loop: true },
  light: { row: 1, frames: 4, fps: 14, loop: false },
  heavy: { row: 2, frames: 4, fps: 12, loop: false },
  hit: { row: 3, frames: 2, fps: 10, loop: false },
  ko: { row: 4, frames: 4, fps: 8, loop: false },
  win: { row: 5, frames: 4, fps: 8, loop: true },
}

/** Moves with no row of their own, and the row they are drawn from. */
export const ALIAS: Record<Exclude<Animation, DrawnAnimation>, DrawnAnimation> = {
  walk: 'idle',
  special: 'heavy',
  block: 'idle',
}

export interface ArtManifest {
  /** The square frame size, in pixels. */
  frame: number
  /** Pixel art: enlarged with hard square pixels instead of smoothed. */
  pixel?: boolean
  animations: Partial<Record<Animation, AnimSpec>>
  /** A layer's name ("base/a-1", "hair/a-2", "gear/straw_hat@b",
   *  "hair/b-2.back") to its single pose. */
  layers: Record<string, string>
  /** A layer's name to its sheet of frames, for the layers that have one. */
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
  /** Layer names, bottom first. */
  layers: string[]
  /** Their files, in the same order: all sheets, or all poses. */
  files: string[]
  /** Every layer the fighter needs is there in one kind. */
  complete: boolean
  /** They are sheets, so the fighter is animated frame by frame. */
  sheet: boolean
}

type Art = Pick<ArtManifest, 'layers' | 'sheets'>

/**
 * The layers a fighter is drawn from, bottom first.
 *
 * - A gear item may be drawn once for both bodies (`gear/rags`) or once per
 *   body (`gear/rags@a`, `gear/rags@b`), since the male and female templates
 *   are different poses; the body's own version wins.
 * - Hair and gear may have a back part (`hair/b-2.back`, `gear/twin_blades.back`),
 *   drawn behind the body — long hair over the shoulders, the blade in the far
 *   hand. Backs are optional; the front is what is required.
 *
 * Order: backs (hair's first, then the gear's), body, gear (feet first, charm
 * last, as given), hair.
 */
export function stackFor(
  look: { body: string; skin: number; hair: number },
  gear: string[],
  manifest: Art | null,
): Stack {
  // Sheets first: a fighter whose every layer moves is drawn moving.
  return build(look, gear, manifest?.sheets ?? {}, true) ?? build(look, gear, manifest?.layers ?? {}, false) ?? {
    layers: [],
    files: [],
    complete: false,
    sheet: false,
  }
}

/** The fighter from one kind of file, or null when a layer it needs has none. */
function build(look: { body: string; skin: number; hair: number }, gear: string[], files: Record<string, string>, sheet: boolean): Stack | null {
  const has = (name: string) => name in files
  const base = `base/${look.body}-${look.skin}`
  const hair = `hair/${look.body}-${look.hair}`
  const worn = gear.map((id) => (has(`gear/${id}@${look.body}`) ? `gear/${id}@${look.body}` : `gear/${id}`))
  const required = [base, ...worn, hair]
  if (!required.every(has)) return null
  const backs = [hair, ...worn].map((name) => `${name}.back`).filter(has)
  const layers = [...backs, base, ...worn, hair]
  return { layers, files: layers.map((name) => files[name]), complete: true, sheet }
}

/** A whole-character drawing ("opponent/{id}"), when there is one: its sheet,
 *  else its pose. */
export function wholeStack(name: string, manifest: Art | null): Stack | null {
  const sheet = manifest?.sheets?.[name]
  if (sheet) return { layers: [name], files: [sheet], complete: true, sheet: true }
  const pose = manifest?.layers[name]
  if (pose) return { layers: [name], files: [pose], complete: true, sheet: false }
  return null
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
