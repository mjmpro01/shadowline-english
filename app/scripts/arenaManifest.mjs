/**
 * The pure half of `npm run arena:manifest` and `npm run arena:sheet`: reading
 * and writing PNGs, checking that every layer keeps to the shared frame grid,
 * and writing the manifest FighterSprite reads. See docs/arena-sprites.md.
 *
 * No dependencies: a PNG is a zlib stream of filtered rows, and node:zlib is
 * all it takes to read the 8-bit kinds an image tool writes.
 */

import { deflateSync, inflateSync } from 'node:zlib'

/** Frame sizes accepted: 64 px pixel art (drawn crisp), or 256 px painted art. */
export const FRAMES = [64, 256]

/**
 * The rows of a sheet, top to bottom; columns are frames. Kept identical to
 * SHEET in app/src/lib/arenaArt.ts. walk, special and block have no row: they
 * borrow idle and heavy and move by CSS.
 */
export const SHEET_ANIMATIONS = {
  idle: { row: 0, frames: 4, fps: 6, loop: true },
  light: { row: 1, frames: 4, fps: 14, loop: false },
  heavy: { row: 2, frames: 4, fps: 12, loop: false },
  hit: { row: 3, frames: 2, fps: 10, loop: false },
  ko: { row: 4, frames: 4, fps: 8, loop: false },
  win: { row: 5, frames: 4, fps: 8, loop: true },
}
const ROWS = Object.entries(SHEET_ANIMATIONS)
export const SHEET_COLUMNS = Math.max(...ROWS.map(([, a]) => a.frames))
export const SHEET_ROWS = ROWS.length

/** Where the feet stand in a frame: y = 60 of 64, 240 of 256. */
export const ground = (frame) => Math.round((frame * 60) / 64)

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

/** Every front layer a complete set has. A gear item counts as there when it
 *  is drawn once for both bodies, or once for each. */
export const EXPECTED = [
  ...BODIES.flatMap((b) => FOUR.map((n) => `base/${b}-${n}`)),
  ...BODIES.flatMap((b) => FOUR.map((n) => `hair/${b}-${n}`)),
  ...GEAR.map((id) => `gear/${id}`),
]

/**
 * A file's layer, or null when the name is not one. A layer can have a single
 * pose and a sheet of frames side by side; the sheet ends in `.sheet.png`:
 *   base/a-0.png              → base/a-0, a pose
 *   base/a-0.sheet.png        → base/a-0, its sheet
 *   hair/b-2.back.png         → hair/b-2.back    (drawn behind the body)
 *   gear/rags@b.png           → gear/rags@b      (the female body's own rags)
 *   opponents/alley_boss.png  → opponent/alley_boss
 */
export function parseLayer(path) {
  const m = /^(base|hair|gear|opponents)\/([a-z0-9_-]+)(@[ab])?(\.back)?(\.sheet)?\.png$/.exec(path)
  if (!m) return null
  const [, dir, id, body = '', back = '', sheet = ''] = m
  if (dir === 'base' && (body || back)) return null
  if ((dir === 'hair' || dir === 'opponents') && body) return null
  if (dir === 'opponents' && back) return null
  return { name: `${dir === 'opponents' ? 'opponent' : dir}/${id}${body}${back}`, sheet: !!sheet }
}

/** Just the layer's name. */
export function layerName(path) {
  return parseLayer(path)?.name ?? null
}

// --- PNG ---------------------------------------------------------------------

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const u32 = (b, at) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0

/** Width, height and whether it can be transparent, from a PNG's first bytes. */
export function pngInfo(bytes) {
  if (bytes.length < 33 || SIGNATURE.some((b, i) => bytes[i] !== b)) return null
  const colourType = bytes[25]
  // 4 and 6 carry alpha; a palette (3) may, through a tRNS chunk.
  const hasTRNS = Buffer.from(bytes).includes(Buffer.from('tRNS'))
  return { width: u32(bytes, 16), height: u32(bytes, 20), alpha: colourType === 4 || colourType === 6 || hasTRNS }
}

/** A PNG's pixels as RGBA bytes. 8-bit grey, RGB, palette, grey+alpha and
 *  RGBA, not interlaced — which is what image tools write. */
export function decodePng(bytes) {
  const data = Buffer.from(bytes)
  if (SIGNATURE.some((b, i) => data[i] !== b)) throw new Error('không phải PNG')
  let at = 8
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0
  let palette = null, alphas = null
  const idat = []
  while (at < data.length) {
    const length = u32(data, at)
    const kind = data.toString('latin1', at + 4, at + 8)
    const body = data.subarray(at + 8, at + 8 + length)
    if (kind === 'IHDR') {
      width = u32(body, 0); height = u32(body, 4); depth = body[8]; type = body[9]; interlace = body[12]
    } else if (kind === 'PLTE') palette = body
    else if (kind === 'tRNS') alphas = body
    else if (kind === 'IDAT') idat.push(body)
    else if (kind === 'IEND') break
    at += 12 + length
  }
  if (depth !== 8) throw new Error(`PNG ${depth}-bit chưa hỗ trợ, cần 8-bit`)
  if (interlace) throw new Error('PNG interlaced chưa hỗ trợ')
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type]
  if (!channels) throw new Error(`PNG kiểu màu ${type} chưa hỗ trợ`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const rows = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? rows[y * stride + x - channels] : 0
      const b = y > 0 ? rows[(y - 1) * stride + x] : 0
      const c = x >= channels && y > 0 ? rows[(y - 1) * stride + x - channels] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      rows[y * stride + x] = v & 0xff
    }
  }
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const o = i * 4, s = i * channels
    if (type === 6) rgba.set(rows.subarray(s, s + 4), o)
    else if (type === 2) { rgba.set(rows.subarray(s, s + 3), o); rgba[o + 3] = 255 }
    else if (type === 0) { rgba[o] = rgba[o + 1] = rgba[o + 2] = rows[s]; rgba[o + 3] = 255 }
    else if (type === 4) { rgba[o] = rgba[o + 1] = rgba[o + 2] = rows[s]; rgba[o + 3] = rows[s + 1] }
    else {
      const k = rows[s]
      rgba.set(palette.subarray(k * 3, k * 3 + 3), o)
      rgba[o + 3] = alphas && k < alphas.length ? alphas[k] : 255
    }
  }
  return { width, height, rgba }
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(kind, body) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(kind, 4, 'latin1')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, tail])
}

/** RGBA bytes as an 8-bit RGBA PNG. */
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1)
  return Buffer.concat([Buffer.from(SIGNATURE), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

// --- Frames ------------------------------------------------------------------

/** The lowest opaque row of one cell, or -1 when the cell is empty. */
function lowest(image, left, top, size) {
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) {
      if (image.rgba[((top + y) * image.width + left + x) * 4 + 3] > 24) return y
    }
  }
  return -1
}

/**
 * Whether a layer keeps to the frame grid. For a sheet: no frame drawn past a
 * row's count. For a body (a base, or an opponent drawn whole): every frame
 * drawn, and the feet on the ground line in each one — the line every other
 * layer is drawn against, so a body that drifts takes its gear with it.
 */
export function checkFrames(path, image, frame) {
  const errors = []
  const body = /^(base|opponents)\//.test(path)
  const sheet = image.width !== frame
  const cells = sheet ? ROWS : [['pose', { row: 0, frames: 1 }]]
  const floor = ground(frame)
  for (const [name, { row, frames }] of cells) {
    for (let col = 0; col < (sheet ? SHEET_COLUMNS : 1); col++) {
      const bottom = lowest(image, col * frame, row * frame, frame)
      const where = sheet ? `${name} frame ${col + 1}` : 'tư thế'
      if (col >= frames) {
        if (bottom >= 0) errors.push(`${path}: ${name} có hình ở frame ${col + 1}, hàng này chỉ có ${frames} frame`)
        continue
      }
      if (!body) continue
      // A win may jump and a KO falls through the air: their feet may leave
      // the ground, never sink below it.
      const airborne = name === 'win' || name === 'ko'
      const off = airborne ? bottom > floor + 1 : Math.abs(bottom - floor) > 1
      if (bottom < 0) errors.push(`${path}: ${where} trống`)
      else if (off) errors.push(`${path}: ${where} chân ở y=${bottom}, phải ở y=${floor} (±1)`)
    }
  }
  return errors
}

/**
 * Lays numbered frames out as a sheet: `frames` is [{ animation, index (1-),
 * image }], every image one frame square. Missing frames are left empty and
 * named in the warnings; frames that are not in the spec are refused.
 */
export function assembleSheet(frames, frame) {
  const errors = []
  const warnings = []
  const width = SHEET_COLUMNS * frame
  const height = SHEET_ROWS * frame
  const rgba = new Uint8Array(width * height * 4)
  const seen = new Set()
  for (const { animation, index, image } of frames) {
    const spec = SHEET_ANIMATIONS[animation]
    if (!spec) { errors.push(`${animation}-${index}: không có động tác "${animation}"`); continue }
    if (index < 1 || index > spec.frames) { errors.push(`${animation}-${index}: ${animation} chỉ có ${spec.frames} frame`); continue }
    if (image.width !== frame || image.height !== frame) {
      errors.push(`${animation}-${index}: ${image.width}×${image.height}, cần ${frame}×${frame}`)
      continue
    }
    seen.add(`${animation}-${index}`)
    for (let y = 0; y < frame; y++) {
      const from = y * frame * 4
      rgba.set(image.rgba.subarray(from, from + frame * 4), ((spec.row * frame + y) * width + (index - 1) * frame) * 4)
    }
  }
  for (const [name, { frames: count }] of ROWS) {
    for (let i = 1; i <= count; i++) if (!seen.has(`${name}-${i}`)) warnings.push(`thiếu ${name}-${i}, để trống`)
  }
  return { width, height, rgba, errors, warnings }
}

// --- Manifest ----------------------------------------------------------------

/**
 * @param files {path, width, height, alpha, image?}[] relative to public/arena;
 *   `image` (decoded pixels) lets the frames be checked
 * @returns {{manifest: object|null, errors: string[], warnings: string[], missing: string[], missingSheets: string[], frame: number|null, sheets: number}}
 */
export function buildManifest(files) {
  const errors = []
  const warnings = []
  const layers = {}
  const sheets = {}
  const sizes = new Map()
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const parsed = parseLayer(f.path)
    if (!parsed) {
      warnings.push(`${f.path}: không phải tên lớp nào, bỏ qua`)
      continue
    }
    const { name, sheet } = parsed
    const plain = name.replace(/@[ab]/, '').replace(/\.back$/, '')
    if (name.startsWith('opponent/') ? !OPPONENTS.includes(name.slice(9)) : !EXPECTED.includes(plain)) {
      warnings.push(`${f.path}: không có trong danh mục, vẫn khai báo`)
    }
    const frame = FRAMES.find((n) =>
      sheet ? f.width === SHEET_COLUMNS * n && f.height === SHEET_ROWS * n : f.width === n && f.height === n,
    )
    if (!frame) {
      const wanted = FRAMES.map((n) => (sheet ? `${SHEET_COLUMNS * n}×${SHEET_ROWS * n}` : `${n}×${n}`)).join(' hoặc ')
      errors.push(`${f.path}: ${f.width}×${f.height}, ${sheet ? 'sheet' : 'một tư thế'} phải là ${wanted}`)
      continue
    }
    if (!f.alpha) warnings.push(`${f.path}: không có kênh trong suốt (alpha), nền sẽ che các lớp dưới`)
    if (f.image) errors.push(...checkFrames(f.path, f.image, frame))
    sizes.set(frame, [...(sizes.get(frame) ?? []), f.path])
    if (sheet) sheets[name] = f.path
    else layers[name] = f.path
  }
  if (sizes.size > 1) {
    const listed = [...sizes].map(([n, paths]) => `${paths.length} file khung ${n} px (vd ${paths[0]})`)
    errors.push(`Trộn cỡ khung: ${listed.join(', ')}. Mọi file phải cùng cỡ khung.`)
  }

  // A gear item is there when drawn once for both, or once for each body.
  const missingFrom = (have) => {
    const missing = []
    for (const name of EXPECTED) {
      if (name in have || (name.startsWith('gear/') && BODIES.every((b) => `${name}@${b}` in have))) continue
      if (name.startsWith('gear/') && BODIES.some((b) => `${name}@${b}` in have)) {
        missing.push(...BODIES.filter((b) => !(`${name}@${b}` in have)).map((b) => `${name}@${b}`))
      } else missing.push(name)
    }
    return missing
  }
  const all = { ...layers, ...sheets }
  const missing = missingFrom(all)
  const missingSheets = missingFrom(sheets)

  // A body that moves while its hair and clothes do not yet is drawn still:
  // say which layers it waits for.
  for (const b of BODIES) {
    if (!FOUR.some((n) => `base/${b}-${n}` in sheets)) continue
    const waiting = missingSheets.filter((name) => name.startsWith(`hair/${b}-`) || (name.startsWith('gear/') && !name.endsWith(`@${b === 'a' ? 'b' : 'a'}`)))
    if (waiting.length) warnings.push(`thân ${b} đã có sheet, nhưng ${waiting.length} lớp tóc/đồ chưa có, nên võ sĩ vẫn hiện bằng hình một tư thế cho tới khi đủ`)
  }

  const count = Object.keys(all).length
  if (errors.length || count === 0) {
    return { manifest: null, errors, warnings, missing, missingSheets, frame: null, sheets: Object.keys(sheets).length }
  }
  const frame = [...sizes.keys()][0]
  const manifest = { frame, animations: SHEET_ANIMATIONS, layers, sheets }
  // Pixel art is drawn small and enlarged with hard edges, not smoothed.
  if (frame === 64) manifest.pixel = true
  return { manifest, errors, warnings, missing, missingSheets, frame, sheets: Object.keys(sheets).length }
}
