import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { asAdmin, resetServer } from './session'

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
