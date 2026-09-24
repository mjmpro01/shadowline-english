import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { API_URL } from './environment'
import { LESSON, VIDEO_CLIP } from './fixtures'
import { asAdmin } from './session'

/**
 * Publishes the lesson fixture as four library clips, through the API.
 *
 * It used to drive the studio: set the file, wait for the cut proposal, type
 * four lines, press Publish. That was the only way to get clips into a library,
 * and it made every practice test depend on the studio's markup. The studio is a
 * separate app now, tested in `e2e/console/`, and these tests want a library
 * rather than a studio — so this asks the API for one, as an admin, which is
 * both faster and the only thing here that is actually being set up.
 *
 * The audio matters: a clip with none is kept but not scored, and half these
 * tests are about scoring. Each clip gets the slice of the fixture it was cut
 * from, at the boundaries the fixture itself was generated with.
 */

/** Where the four lines are in `lesson.wav`, from the spec that wrote it:
 *  3.2s of speech, 0.55s of pause, 2.4/0.55, 4/0.55, 2.8/0.55. */
const CUTS: { start: number; end: number }[] = [
  { start: 0, end: 3.2 },
  { start: 3.75, end: 6.15 },
  { start: 6.7, end: 10.7 },
  { start: 11.25, end: 14.05 },
]

export const LESSON_PLAYLIST = 'Lesson one'

export async function publishLesson(page: Page): Promise<void> {
  await asAdmin(page)

  // The recording, so the clips hang off an episode the way published ones do.
  const source = await page.request.post(
    `${API_URL}/api/admin/sources?name=${encodeURIComponent('lesson.wav')}`,
    { headers: { 'Content-Type': 'audio/wav' }, data: readFileSync(LESSON) },
  )
  expect(source.ok(), `uploading the lesson: ${source.status()}`).toBe(true)
  const { id: sourceId } = (await source.json()) as { id: string }

  const created = await page.request.post(`${API_URL}/api/admin/clips`, {
    data: {
      clips: CUTS.map((cut, index) => ({
        title: `Clip ${index + 1}`,
        source: 'lesson.wav',
        playlist: LESSON_PLAYLIST,
        categories: ['interview', 'daily'],
        timestamp: `${clock(cut.start)}–${clock(cut.end)}`,
        durationSeconds: cut.end - cut.start,
        summary: 'No takes recorded yet — practice this clip to see your pitch analysis.',
        captions: [{ text: `Shadow this line ${index + 1}`, ipa: '' }],
        sourceId,
        startSeconds: cut.start,
        endSeconds: cut.end,
      })),
    },
  })
  expect(created.ok(), `publishing the lesson: ${created.status()}`).toBe(true)
  const clips = (await created.json()) as { id: string }[]

  const wav = readFileSync(LESSON)
  for (const [index, clip] of clips.entries()) {
    const audio = await page.request.put(`${API_URL}/api/admin/clips/${clip.id}/audio`, {
      headers: { 'Content-Type': 'audio/wav' },
      data: sliceWav(wav, CUTS[index].start, CUTS[index].end),
    })
    expect(audio.ok(), `clip ${index + 1} audio: ${audio.status()}`).toBe(true)
  }
  // No navigation: this leaves a library behind, not a screen. Where to go next
  // is the caller's business, and the console's tests are not even on this
  // origin.
}

/** The studio writes this shape, and the library reads it back on every card. */
function clock(seconds: number): string {
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${(whole % 60).toString().padStart(2, '0')}.${Math.floor((seconds % 1) * 10)}`
}

/**
 * A range of a 16-bit mono WAV, as its own WAV.
 *
 * The studio does this in the browser from decoded samples; here the file is
 * already 16-bit mono PCM — `e2e/fixtures.ts` writes it — so the slice is
 * arithmetic on the header and a copy of the bytes.
 */
function sliceWav(file: Buffer, start: number, end: number): Buffer {
  const rate = file.readUInt32LE(24)
  const dataAt = 44
  const from = dataAt + Math.floor(start * rate) * 2
  const to = Math.min(file.length, dataAt + Math.ceil(end * rate) * 2)
  const pcm = file.subarray(from, to)

  const out = Buffer.alloc(44 + pcm.length)
  file.copy(out, 0, 0, 44)
  out.writeUInt32LE(36 + pcm.length, 4)
  out.writeUInt32LE(pcm.length, 40)
  pcm.copy(out, 44)
  return out
}

/**
 * Publishes the video fixture as clips with a picture, through the API.
 *
 * The learner-facing video tests need a clip whose picture exists: the still on
 * its card, the mp4 the player loads, the muted frame under a dub. Producing one
 * means an upload, a batch, and ffmpeg — so this asks the API for all three and
 * then waits for the cutter, which is the one part nothing can hurry.
 *
 * The console's own tests cut the same file through the studio's screens. This is
 * for the tests that are about what a learner sees afterwards.
 */
export async function publishVideoLesson(
  page: Page,
  line: (n: number) => string,
  playlist = 'Film night',
): Promise<void> {
  await asAdmin(page)

  const source = await page.request.post(
    `${API_URL}/api/admin/sources?name=${encodeURIComponent('studio-clip.webm')}`,
    { headers: { 'Content-Type': 'video/webm' }, data: readFileSync(VIDEO_CLIP) },
  )
  expect(source.ok(), `uploading the film: ${source.status()}`).toBe(true)
  const { id: sourceId } = (await source.json()) as { id: string }

  // Two cuts inside the fixture's nine seconds, each well under the clip limit.
  const cuts = [
    { start: 0, end: 2.5 },
    { start: 3, end: 5.5 },
  ]
  const created = await page.request.post(`${API_URL}/api/admin/clips`, {
    data: {
      clips: cuts.map((cut, index) => ({
        title: `Film clip ${index + 1}`,
        source: 'studio-clip.webm',
        playlist,
        categories: ['film'],
        timestamp: `${clock(cut.start)}–${clock(cut.end)}`,
        durationSeconds: cut.end - cut.start,
        summary: 'No takes recorded yet — practice this clip to see your pitch analysis.',
        captions: [{ text: line(index + 1), ipa: '' }],
        sourceId,
        startSeconds: cut.start,
        endSeconds: cut.end,
      })),
    },
  })
  expect(created.ok(), `publishing the film: ${created.status()}`).toBe(true)

  // The cutter is ffmpeg on another process, so this waits on the clip reporting
  // its own picture rather than on anything the screen says. Polled through the
  // console's clip manager: there is no endpoint that hands out the library.
  await expect
    .poll(
      async () => {
        const listing = await (
          await page.request.get(`${API_URL}/api/admin/clips?limit=200`)
        ).json()
        return (listing.clips as { posterUrl: string }[]).filter((clip) => clip.posterUrl).length
      },
      { timeout: 90_000, intervals: [1000] },
    )
    .toBeGreaterThanOrEqual(cuts.length)
}

/** Marks a clip featured, so it reaches the dashboard. */
export async function feature(page: Page, title: string): Promise<void> {
  const listing = await page.request.get(`${API_URL}/api/admin/clips?limit=200&q=${encodeURIComponent(title)}`)
  expect(listing.ok(), `finding ${title}: ${listing.status()}`).toBe(true)
  const { clips } = (await listing.json()) as { clips: { id: string; captions: { text: string }[] }[] }
  const wanted = clips.find((clip) => clip.captions[0]?.text === title)
  expect(wanted, `no clip says "${title}"`).toBeTruthy()

  const patched = await page.request.patch(`${API_URL}/api/admin/clips/${wanted!.id}`, {
    data: { featured: true },
  })
  expect(patched.ok(), `featuring ${title}: ${patched.status()}`).toBe(true)
}
