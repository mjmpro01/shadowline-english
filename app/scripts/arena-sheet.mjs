/**
 * Assembles a layer's frames into its sheet:
 *
 *   npm run arena:sheet                 every layer under art/arena-frames/
 *   npm run arena:sheet -- base/a-0     just that one
 *
 * Frames are one PNG each, the frame size square, named by move and number:
 *
 *   art/arena-frames/base/a-0/idle-1.png … idle-4.png, light-1.png …
 *   art/arena-frames/gear/rags@b/…     art/arena-frames/hair/b-2.back/…
 *
 * and the sheet is written to public/arena/<layer>.png — base/a-0.png,
 * gear/rags@b.png — for `npm run arena:manifest` to check and declare. Every
 * frame of every layer of a fighter has to be drawn on the same canvas in the
 * same pose as the body's frame with the same name; that is what keeps them in
 * step. See docs/arena-sprites.md.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { FRAMES, assembleSheet, decodePng, encodePng } from './arenaManifest.mjs'

const SOURCE = 'art/arena-frames'
const OUT = 'public/arena'

/** Layer folders: the ones that hold frame PNGs directly. */
function layersUnder(dir, prefix = '') {
  const found = []
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry)
    if (!statSync(path).isDirectory()) continue
    const name = prefix ? `${prefix}/${entry}` : entry
    if (readdirSync(path).some((f) => f.endsWith('.png'))) found.push(name)
    else found.push(...layersUnder(path, name))
  }
  return found
}

if (!existsSync(SOURCE)) {
  console.log(`Chưa có ${SOURCE}/. Đặt frame vào ${SOURCE}/<lớp>/<động tác>-<số>.png rồi chạy lại.`)
  process.exit(0)
}
const wanted = process.argv.slice(2)
const layers = wanted.length ? wanted : layersUnder(SOURCE)
let failed = false
for (const layer of layers) {
  const dir = join(SOURCE, layer)
  if (!existsSync(dir)) {
    console.error(`✗ ${layer}: không có ${dir}`)
    failed = true
    continue
  }
  const frames = []
  for (const file of readdirSync(dir).sort()) {
    const m = /^([a-z]+)-(\d+)\.png$/.exec(file)
    if (!m) {
      if (file.endsWith('.png')) console.warn(`! ${layer}/${file}: tên phải là <động tác>-<số>.png, bỏ qua`)
      continue
    }
    try {
      frames.push({ animation: m[1], index: Number(m[2]), image: decodePng(readFileSync(join(dir, file))) })
    } catch (err) {
      console.error(`✗ ${layer}/${file}: ${err.message}`)
      failed = true
    }
  }
  const size = frames[0]?.image.width
  if (!FRAMES.includes(size)) {
    console.error(`✗ ${layer}: frame phải là ${FRAMES.map((n) => `${n}×${n}`).join(' hoặc ')}`)
    failed = true
    continue
  }
  const sheet = assembleSheet(frames, size)
  for (const w of sheet.warnings) console.warn(`! ${layer}: ${w}`)
  for (const e of sheet.errors) console.error(`✗ ${layer}: ${e}`)
  if (sheet.errors.length) {
    failed = true
    continue
  }
  const target = join(OUT, `${layer}.png`)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, encodePng(sheet.width, sheet.height, sheet.rgba))
  console.log(`✓ ${target}: ${frames.length} frame, ${sheet.width}×${sheet.height}`)
}
if (failed) process.exit(1)
console.log('Xong. Chạy npm run arena:manifest để kiểm tra từng frame và khai báo.')
