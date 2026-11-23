/**
 * The Arena's art, as the artist delivers it: sheets of frames under
 * /arena/, described by /arena/manifest.json (see docs/arena-sprites.md).
 *
 * Until a sheet is there, the fighter is drawn by FighterSprite itself, so the
 * Arena works before any art arrives and each piece can land on its own.
 */

export type Animation = 'idle' | 'walk' | 'light' | 'heavy' | 'special' | 'block' | 'hit' | 'ko' | 'win'

export interface ArtManifest {
  /** The square frame size, in pixels. */
  frame: number
  /** Pixel art: enlarged with hard square pixels instead of smoothed. */
  pixel?: boolean
  animations: Partial<Record<Animation, { row: number; frames: number; fps: number }>>
  /** A layer's name ("base/a-1", "hair/a-2", "gear/straw_hat") to its sheet. */
  layers: Record<string, string>
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

/** The layers a fighter is drawn from, bottom first. */
export function layersFor(body: string, skin: number, hair: number, gear: string[]): string[] {
  return [`base/${body}-${skin}`, ...gear.map((id) => `gear/${id}`), `hair/${body}-${hair}`]
}
