export interface ArtFile {
  path: string
  width: number
  height: number
  alpha: boolean
}
export interface AnimationRow {
  row: number
  frames: number
  fps: number
}
export interface Built {
  manifest: { frame: number; animations: Record<string, AnimationRow>; layers: Record<string, string> } | null
  errors: string[]
  warnings: string[]
  missing: string[]
  mode: 'pose' | 'sheet' | null
}
export const FRAME: number
export const SHEET_ANIMATIONS: Record<string, AnimationRow>
export const POSE_ANIMATIONS: Record<string, AnimationRow>
export const GEAR: string[]
export const OPPONENTS: string[]
export const EXPECTED: string[]
export function layerName(path: string): string | null
export function pngInfo(bytes: Uint8Array): { width: number; height: number; alpha: boolean } | null
export function buildManifest(files: ArtFile[]): Built
