/**
 * Writes public/arena/manifest.json from the PNGs in public/arena/{base,hair,
 * gear,opponents}/, checks their size and transparency, and lists what is
 * still missing. Run it after adding or changing any Arena art:
 *
 *   npm run arena:manifest
 *
 * The format is in docs/arena-sprites.md.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildManifest, pngInfo } from './arenaManifest.mjs'

const ROOT = 'public/arena'
const files = []
for (const dir of ['base', 'hair', 'gear', 'opponents']) {
  const at = join(ROOT, dir)
  if (!existsSync(at)) continue
  for (const name of readdirSync(at).sort()) {
    if (!name.endsWith('.png')) continue
    const info = pngInfo(readFileSync(join(at, name)))
    if (!info) {
      console.error(`✗ ${dir}/${name}: không đọc được, không phải PNG`)
      process.exitCode = 1
      continue
    }
    files.push({ path: `${dir}/${name}`, ...info })
  }
}

const { manifest, errors, warnings, missing, mode, frame } = buildManifest(files)
for (const w of warnings) console.warn(`! ${w}`)
for (const e of errors) console.error(`✗ ${e}`)
if (errors.length) {
  console.error('Chưa ghi manifest.json: sửa các lỗi trên rồi chạy lại.')
  process.exit(1)
}
if (!manifest) {
  console.log(`Chưa có hình nào trong ${ROOT}/. App vẫn vẽ võ sĩ tạm.`)
  process.exit(process.exitCode ?? 0)
}
writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
const count = Object.keys(manifest.layers).length
console.log(`✓ ${ROOT}/manifest.json: ${count} lớp, kiểu ${mode === 'pose' ? 'một tư thế' : 'sheet 9 hàng'}, khung ${frame} px${manifest.pixel ? ' (pixel art)' : ''}.`)
if (missing.length) {
  console.log(`Còn thiếu ${missing.length} lớp (võ sĩ nào cần lớp thiếu sẽ vẫn vẽ tạm):`)
  console.log('  ' + missing.join(', '))
} else {
  console.log('Đủ bộ: mọi thân, tóc và trang bị đã có hình.')
}
