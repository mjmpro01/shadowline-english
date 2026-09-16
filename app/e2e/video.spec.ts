import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { API_URL } from './environment'
import { asAdmin, asLearner, resetServer } from './session'

/**
 * The studio accepted video from the start but only ever decoded its audio, so
 * cutting a film meant working blind. These cover the picture: that it is on
 * screen, that the strip along the timeline fills in, and that both of them
 * move with the playhead.
 *
 * The fixture is committed rather than generated: making one needs ffmpeg, and
 * the browser tests should not. It is WebM because the Chromium these run
 * against ships without the patented codecs — an MP4 of the same clip cannot be
 * decoded here, though it plays in the Chrome an admin actually uses.
 */
const CLIP = join(import.meta.dirname, 'fixtures', 'studio-clip.webm')

test.beforeEach(async ({ page }) => {
  await resetServer(page)
  await asAdmin(page)
  await page.goto('/admin')
})

async function upload(page: import('@playwright/test').Page) {
  await page.locator('input[type=file]').setInputFiles(CLIP)
  await expect(page.locator('.waveform')).toBeVisible({ timeout: 30_000 })
}

test('an uploaded video is shown, not just heard', async ({ page }) => {
  await upload(page)

  const video = page.locator('.studio-video')
  await expect(video).toBeVisible()
  // A picture, not a zero-by-zero element that merely exists.
  const size = await video.evaluate((el: HTMLVideoElement) => ({ w: el.videoWidth, h: el.videoHeight }))
  expect(size.w).toBeGreaterThan(0)
  expect(size.h).toBeGreaterThan(0)
})

test('the filmstrip fills in along the timeline', async ({ page }) => {
  await upload(page)

  const images = page.locator('.filmstrip-cell img')
  // Frames arrive one seek at a time, so the assertion is that the strip gets
  // there, not that it is there the instant the wave is.
  await expect.poll(async () => images.count(), { timeout: 60_000 }).toBeGreaterThan(4)

  const src = await images.first().getAttribute('src')
  expect(src).toMatch(/^data:image\/jpeg/)
})

test('clicking the strip moves the picture to that moment', async ({ page }) => {
  await upload(page)
  await expect.poll(async () => page.locator('.filmstrip-cell img').count(), { timeout: 60_000 }).toBeGreaterThan(4)

  const strip = page.locator('.filmstrip')
  const box = (await strip.boundingBox())!
  await strip.click({ position: { x: box.width * 0.75, y: box.height / 2 } })

  const video = page.locator('.studio-video')
  const { at, duration } = await video.evaluate((el: HTMLVideoElement) => ({
    at: el.currentTime,
    duration: el.duration,
  }))
  // Three quarters of the way in, give or take the width of a click.
  expect(at).toBeGreaterThan(duration * 0.6)
  expect(at).toBeLessThan(duration * 0.9)
})

test('playing a clip plays the video over that range', async ({ page }) => {
  await upload(page)

  const video = page.locator('.studio-video')
  await page.getByRole('button', { name: 'Play', exact: true }).first().click()

  // The first clip starts at the top of the file, so playing it moves the
  // video off zero and leaves it inside the clip rather than running on.
  await expect
    .poll(async () => video.evaluate((el: HTMLVideoElement) => el.currentTime), { timeout: 15_000 })
    .toBeGreaterThan(0.2)

  const firstClipEnd = await page
    .locator('.card-meta.mono')
    .first()
    .innerText()
    .then((text) => Number(text.match(/·\s*([\d.]+)s/)?.[1] ?? '99'))

  await expect
    .poll(async () => video.evaluate((el: HTMLVideoElement) => el.paused), { timeout: 20_000 })
    .toBe(true)

  const stoppedAt = await video.evaluate((el: HTMLVideoElement) => el.currentTime)
  expect(stoppedAt).toBeLessThanOrEqual(firstClipEnd + 1)
})

/**
 * The whole point of cutting server-side: a learner sees the picture, not just
 * the studio. This walks the full chain — upload, publish, the cutter's ffmpeg
 * run, and the clip playing on the Practice screen — with nothing stubbed.
 */
test('a clip published from video reaches the learner with its picture', async ({ page }) => {
  // Longer than the default: this one waits on ffmpeg, not just on the browser.
  test.setTimeout(180_000)
  await upload(page)

  await page.getByLabel('Playlist').fill('Film night')
  const lines = page.locator('input[id^="line-"]')
  for (let i = 0; i < (await lines.count()); i++) {
    await lines.nth(i).fill(`Watch this line ${i + 1}`)
  }

  await page.getByRole('button', { name: /Publish \d+ clips/ }).click()
  await expect(page.getByText(/clips are now in the library/)).toBeVisible({ timeout: 60_000 })
  // The admin is told the picture is still coming, rather than left wondering
  // why the clip they just published has none.
  await expect(page.getByText(/video is being cut in the background/)).toBeVisible()

  await asLearner(page)

  // Wait on the cut itself rather than on the screen: the clip reports its own
  // video the moment the cutter records it, and polling the API says whether
  // the chain worked without a reload loop clouding the answer.
  await expect
    .poll(
      async () => {
        const clips = await (await page.request.get(`${API_URL}/api/clips`)).json()
        return clips.filter((clip: { title: string; hasVideo: boolean }) =>
          clip.title.startsWith('Watch this line') && clip.hasVideo).length
      },
      { timeout: 90_000, intervals: [1000] },
    )
    .toBeGreaterThan(0)

  await page.goto('/library')
  await page.getByLabel('Search clips').fill('Watch this line 1')
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')

  const clip = page.locator('video.clip-video')
  await expect(clip).toBeVisible({ timeout: 20_000 })

  // The source is what is checked, not videoWidth. The cutter emits h264/aac
  // mp4 — the format every browser a learner will use can play, Safari
  // included — and this Chromium is built without the patented codecs, so it
  // reports a width of zero for a file it simply will not decode. The src
  // proves the whole chain: the cutter's own mp4, under this clip's id, handed
  // to the player. Do not "fix" this by asserting a size; assert the format.
  const src = await clip.getAttribute('src')
  expect(src).toContain('.mp4')
  expect(src).toContain('/files/clips/')

  // And the button offers to watch it, rather than still talking about audio.
  await expect(page.getByRole('button', { name: 'Watch clip again' })).toBeEnabled()
})
