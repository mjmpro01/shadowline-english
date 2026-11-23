/**
 * The pure half of `npm run arena:manifest`: from the PNGs dropped into
 * public/arena/, the manifest FighterSprite reads, and what is still missing.
 * See docs/arena-sprites.md.
 */

export const FRAME = 256

/** The rows of a full sheet, in order, with their frame counts and speed. */
export const SHEET_ANIMATIONS = {
  idle: { row: 0, frames: 6, fps: 8 },
  walk: { row: 1, frames: 8, fps: 12 },
  light: { row: 2, frames: 5, fps: 14 },
  heavy: { row: 3, frames: 7, fps: 14 },
  special: { row: 4, frames: 10, fps: 14 },
  block: { row: 5, frames: 3, fps: 10 },
  hit: { row: 6, frames: 3, fps: 12 },
  ko: { row: 7, frames: 6, fps: 10 },
  win: { row: 8, frames: 6, fps: 8 },
}

/** One pose for every move: the app's CSS moves the whole fighter instead. */
export const POSE_ANIMATIONS = Object.fromEntries(Object.keys(SHEET_ANIMATIONS).map((name) => [name, { row: 0, frames: 1, fps: 1 }]))

const BODIES = ['a', 'b']
const FOUR = [0, 1, 2, 3]

/** The gear ids of server/internal/arena/catalog.go. */
export const GEAR = [
  'rags', 'patched_tunic', 'leather_vest', 'scale_mail',
  'bare_fists', 'cloth_wraps', 'leather_gloves', 'iron_knuckles',
  'bare_feet', 'straw_sandals', 'swift_boots',
  'straw_hat', 'leather_cap', 'iron_helm',
  'walking_stick', 'bo_staff', 'twin_blades',
  'lucky_coin', 'jade_charm', 'phoenix_feather',
]

/** The tower's opponents (server/internal/arena/tower.go); each is optional. */
export const OPPONENTS = [
  'pickpocket', 'dockhand', 'market_bully', 'stick_fighter', 'alley_boss',
  'novice', 'wandering_monk', 'fan_dancer', 'iron_guard', 'iron_general',
  'wind_walker', 'jade_duelist', 'mirror', 'thunder_fist', 'tower_master',
]

/** Every layer a complete set has, by its manifest name. */
export const EXPECTED = [
  ...BODIES.flatMap((b) => FOUR.map((n) => `base/${b}-${n}`)),
  ...BODIES.flatMap((b) => FOUR.map((n) => `hair/${b}-${n}`)),
  ...GEAR.map((id) => `gear/${id}`),
]

/** A file's manifest name: "gear/rags.png" → "gear/rags", "opponents/x.png" → "opponent/x". */
export function layerName(path) {
  const m = /^(base|hair|gear|opponents)\/([a-z0-9_-]+)\.png$/.exec(path)
  if (!m) return null
  return `${m[1] === 'opponents' ? 'opponent' : m[1]}/${m[2]}`
}

/** Width, height and whether it can be transparent, from a PNG's first bytes. */
export function pngInfo(bytes) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 33 || sig.some((b, i) => bytes[i] !== b)) return null
  const u32 = (at) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
  const colourType = bytes[25]
  // 4 and 6 carry alpha; a palette (3) may, through a tRNS chunk.
  const hasTRNS = Buffer.from(bytes).includes(Buffer.from('tRNS'))
  return { width: u32(16), height: u32(20), alpha: colourType === 4 || colourType === 6 || hasTRNS }
}

/**
 * @param files {path, width, height, alpha}[] relative to public/arena
 * @returns {{manifest: object|null, errors: string[], warnings: string[], missing: string[], mode: 'pose'|'sheet'|null}}
 */
export function buildManifest(files) {
  const errors = []
  const warnings = []
  const layers = {}
  const modes = new Map()
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const name = layerName(f.path)
    if (!name) {
      warnings.push(`${f.path}: không phải tên lớp nào, bỏ qua`)
      continue
    }
    if (name.startsWith('opponent/') ? !OPPONENTS.includes(name.slice(9)) : !EXPECTED.includes(name)) {
      warnings.push(`${f.path}: không có trong danh mục, vẫn khai báo`)
    }
    let mode
    if (f.width === FRAME && f.height === FRAME) mode = 'pose'
    else if (f.width === 10 * FRAME && f.height === 9 * FRAME) mode = 'sheet'
    else {
      errors.push(`${f.path}: ${f.width}×${f.height}, cần 256×256 (một tư thế) hoặc 2560×2304 (đủ 9 hàng động tác)`)
      continue
    }
    if (!f.alpha) warnings.push(`${f.path}: không có kênh trong suốt (alpha), nền sẽ che các lớp dưới`)
    modes.set(f.path, mode)
    layers[name] = f.path
  }
  const kinds = new Set(modes.values())
  if (kinds.size > 1) {
    const poses = [...modes].filter(([, m]) => m === 'pose').map(([p]) => p)
    const sheets = [...modes].filter(([, m]) => m === 'sheet').map(([p]) => p)
    errors.push(`Trộn hai kiểu: ${poses.length} file một tư thế (vd ${poses[0]}) và ${sheets.length} sheet (vd ${sheets[0]}). Mọi file phải cùng một kiểu.`)
  }
  const missing = EXPECTED.filter((name) => !(name in layers))
  if (errors.length || kinds.size === 0) return { manifest: null, errors, warnings, missing, mode: null }
  const mode = [...kinds][0]
  return {
    manifest: { frame: FRAME, animations: mode === 'pose' ? POSE_ANIMATIONS : SHEET_ANIMATIONS, layers },
    errors,
    warnings,
    missing,
    mode,
  }
}
