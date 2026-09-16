import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { MELODIES, RATE, tone } from '../test/tone'

/**
 * Chromium reads the fake microphone from a WAV file given at launch, so the
 * clips have to exist on disk before the browser starts. They are generated
 * rather than committed: the melody is the point, and it is defined in code.
 */
function writeWav(path: string, samples: Float32Array): string {
  const buffer = Buffer.alloc(44 + samples.length * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples.length * 2, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(RATE, 24)
  buffer.writeUInt32LE(RATE * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples.length * 2, 40)
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2)
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, buffer)
  return path
}

const FIXTURE_DIR = join(process.cwd(), 'test-results', 'audio')

/** The clip being shadowed. */
export const SOURCE_CLIP = join(FIXTURE_DIR, 'source-clip.wav')
/** A second clip with a flat delivery, for checking one clip's contour is not
    reused to score another. */
export const FLAT_CLIP = join(FIXTURE_DIR, 'flat-clip.wav')
/** Longer than a clip is allowed to be. */
export const OVERLONG_CLIP = join(FIXTURE_DIR, 'overlong-clip.wav')
/** A decent shadow of it, in a lower voice, fed in as the microphone. */
export const USER_TAKE = join(FIXTURE_DIR, 'user-take.wav')

export function writeAudioFixtures(): void {
  writeWav(SOURCE_CLIP, tone({ melody: MELODIES.wide }))
  writeWav(FLAT_CLIP, tone({ melody: MELODIES.flat }))
  writeWav(OVERLONG_CLIP, tone({ melody: MELODIES.wide, duration: 10 }))
  writeWav(USER_TAKE, tone({ melody: (p) => MELODIES.wide(p) * 0.85 + 0.3, baseHz: 150 }))
}
