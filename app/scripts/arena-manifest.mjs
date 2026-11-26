/**
 * Writes public/arena/manifest.json from the PNGs in public/arena/characters/
 * and public/arena/stages/ (the duel backgrounds),
 * checks their size, transparency and every frame against the grid, and lists
 * the characters still to draw. Run it after adding or changing any Arena art:
 *
 *   npm run arena:manifest
 *
 * The format is in docs/arena-sprites.md.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildManifest, decodePng, pngInfo } from './arenaManifest.mjs'

const ROOT = 'public/arena'
const files = []
for (const dir of ['characters', 'stages']) {
  const at = join(ROOT, dir)
  if (!existsSync(at)) continue
  for (const name of readdirSync(at).sort()) {
    if (!name.endsWith('.png')) continue
    const bytes = readFileSync(join(at, name))
    const info = pngInfo(bytes)
    if (!info) {
      console.error(`✗ ${dir}/${name}: không đọc được, không phải PNG`)
      process.exitCode = 1
      continue
    }
    // The pixels too, so each frame can be checked against the grid.
    let image
    if (dir === 'stages') {
      files.push({ path: `${dir}/${name}`, ...info })
      continue
    }
    try {
      image = decodePng(bytes)
    } catch (err) {
      console.warn(`! ${dir}/${name}: không kiểm tra được từng frame (${err.message})`)
    }
    files.push({ path: `${dir}/${name}`, ...info, image })
  }
}

const { manifest, errors, warnings, missing, missingSheets, missingStages, frame, sheets } = buildManifest(files)
for (const w of warnings) console.warn(`! ${w}`)
for (const e of errors) console.error(`✗ ${e}`)
if (errors.length) {
  console.error('Chưa ghi manifest.json: sửa các lỗi trên rồi chạy lại.')
  process.exit(1)
}
if (!manifest) {
  console.log(`Chưa có hình nào trong ${ROOT}/characters/. App vẽ mọi nhân vật tạm.`)
  writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify({ frame: 64, pixel: true, animations: {}, layers: {}, sheets: {}, stages: {} }, null, 2) + '\n')
  process.exit(process.exitCode ?? 0)
}
writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
const poses = Object.keys(manifest.layers).length
console.log(`✓ ${ROOT}/manifest.json: ${poses} hình một tư thế, ${sheets} sheet động, khung ${frame} px${manifest.pixel ? ' (pixel art)' : ''}.`)
if (missing.length) {
  console.log(`Còn ${missing.length} nhân vật chưa có hình (vẽ tạm):`)
  console.log('  ' + missing.join(', '))
} else {
  console.log('Đủ bộ hình: mọi nhân vật đã có hình.')
}
if (missingSheets.length && sheets > 0) {
  console.log(`Còn ${missingSheets.length} nhân vật chưa có sheet động:`)
  console.log('  ' + missingSheets.join(', '))
}
if (missingStages.length) {
  console.log(`Còn ${missingStages.length} nền trận đấu chưa có hình (dùng nền mặc định):`)
  console.log('  ' + missingStages.join(', '))
} else {
  console.log('Đủ nền: mọi chặng tháp và đấu với người đã có nền.')
}
