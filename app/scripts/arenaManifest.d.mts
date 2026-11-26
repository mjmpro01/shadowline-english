export interface Decoded {
  width: number
  height: number
  rgba: Uint8Array
}
export interface ArtFile {
  path: string
  width: number
  height: number
  alpha: boolean
  image?: Decoded
}
export interface AnimationRow {
  row: number
  frames: number
  fps: number
  loop: boolean
}
export interface Built {
  manifest: {
    frame: number
    pixel?: boolean
    animations: Record<string, AnimationRow>
    layers: Record<string, string>
    sheets: Record<string, string>
    stages: Record<string, string>
  } | null
  errors: string[]
  warnings: string[]
  missing: string[]
  missingSheets: string[]
  missingStages: string[]
  frame: number | null
  sheets: number
}
export const FRAMES: number[]
export const SHEET_ANIMATIONS: Record<string, AnimationRow>
export const SHEET_COLUMNS: number
export const SHEET_ROWS: number
export const FRAME_NAMES: Record<string, string>
export const CHARACTERS: string[]
export const EXPECTED: string[]
export const STAGES: string[]
export const STAGE_WIDTH: number
export const STAGE_RATIO: number
export function parseStage(path: string): string | null
export function ground(frame: number): number
export function layerName(path: string): string | null
export function parseLayer(path: string): { name: string; sheet: boolean } | null
export function pngInfo(bytes: Uint8Array): { width: number; height: number; alpha: boolean } | null
export function decodePng(bytes: Uint8Array): Decoded
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array
export function checkFrames(path: string, image: Decoded, frame: number): string[]
export function assembleSheet(
  frames: { animation: string; index: number; image: Decoded }[],
  frame: number,
): { width: number; height: number; rgba: Uint8Array; errors: string[]; warnings: string[] }
export function buildManifest(files: ArtFile[]): Built
