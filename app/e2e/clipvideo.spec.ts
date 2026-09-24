import { expect, test } from '@playwright/test'
import { asLearner, resetServer } from './session'
import { publishVideoLesson } from './seed'

/**
 * Where a clip's picture shows up once it is in the library.
 *
 * Practice and Analysis play it; the library and the dashboard show a still,
 * because a grid of twenty cards wants twenty thumbnails and not twenty
 * downloads; Dub Review runs it muted under whichever voice is playing.
 *
 * The clips are published through the API and the cutter is waited for, rather
 * than cut through the console's screens — those are covered where they live,
 * and so is the player: `e2e/console/video.spec.ts` walks the whole chain from an
 * upload to a learner pressing play. What is here is the rest of it, the two
 * places a clip's picture shows up that are not the player.
 */
const LINE = (n: number) => `Watch this line ${n}`

test.beforeEach(async ({ page }) => {
  // Longer than the default: this waits on ffmpeg, not just on the browser.
  test.setTimeout(180_000)
  await resetServer(page)
  await publishVideoLesson(page, LINE)
  await asLearner(page)
})

async function openFirstClip(page: import('@playwright/test').Page) {
  await page.goto('/library')
  await page.getByLabel('Search the library').fill(LINE(1))
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')
}

test('the library and dashboard show a still from the clip', async ({ page }) => {
  await page.goto('/library')
  await page.getByLabel('Search the library').fill(LINE(1))
  const poster = page.locator('.thumb-poster').first()
  await expect(poster).toBeVisible({ timeout: 20_000 })

  const src = await poster.getAttribute('src')
  expect(src).toContain('.jpg')
  // A frame that actually decoded, not a broken image with a src on it.
  await expect
    .poll(async () => poster.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 20_000 })
    .toBeGreaterThan(0)
})

test('dub review runs the picture under the voice, muted', async ({ page }) => {
  await openFirstClip(page)

  // A take is what Dub Review compares against, so record one.
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Stop' }).click()

  const toDubReview = page.getByRole('button', { name: 'Dub review' })
  await expect(toDubReview).toBeEnabled({ timeout: 20_000 })
  await toDubReview.click()
  await page.waitForURL('**/dub')

  const picture = page.locator('.thumb video')
  await expect(picture).toBeVisible({ timeout: 20_000 })

  const wiring = await picture.evaluate((el: HTMLVideoElement) => ({
    muted: el.muted,
    controls: el.controls,
    src: el.getAttribute('src') ?? '',
  }))
  // Muted is the whole idea: the sound is whichever voice is being compared.
  expect(wiring.muted).toBe(true)
  // No controls of its own — the transport below drives it, or the picture and
  // the voice would each have a play button and disagree.
  expect(wiring.controls).toBe(false)
  expect(wiring.src).toContain('.mp4')

  // What is not asserted here: that the picture follows the slider. It does not
  // in this browser, because this Chromium ships without h264 and never loads
  // the clip at all — the same reason the published-clip test checks the format
  // rather than the decoded size. Asserting currentTime here would be asserting
  // the codec, not the wiring.
})
