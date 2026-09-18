import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { API_URL } from './environment'
import { asAdmin, asLearner, resetServer } from './session'

/**
 * Exporting a dub: the learner's voice muxed onto the clip's picture, as a file
 * they can keep and send.
 *
 * The whole chain runs — publish a video clip, wait for the cutter, record a
 * take, ask for the dub, wait for the dubber — with nothing stubbed but the
 * microphone, which Chromium plays from a file.
 */
const CLIP = join(import.meta.dirname, 'fixtures', 'studio-clip.webm')

async function publishVideoClip(page: import('@playwright/test').Page) {
  await resetServer(page)
  await asAdmin(page)
  await page.goto('/admin')
  await page.locator('input[type=file]').setInputFiles(CLIP)
  await expect(page.locator('.waveform')).toBeVisible({ timeout: 30_000 })

  const lines = page.locator('input[id^="line-"]')
  for (let i = 0; i < (await lines.count()); i++) {
    await lines.nth(i).fill(`Dub this line ${i + 1}`)
  }
  await page.getByRole('button', { name: /Publish \d+ clips/ }).click()
  await expect(page.getByText(/clips are now in the library/)).toBeVisible({ timeout: 60_000 })

  await asLearner(page)
  // The cutter has to land before there is a picture to dub onto.
  await expect
    .poll(
      async () => {
        const clips = await (await page.request.get(`${API_URL}/api/clips`)).json()
        return clips.filter((clip: { hasVideo: boolean }) => clip.hasVideo).length
      },
      { timeout: 90_000, intervals: [1000] },
    )
    .toBeGreaterThan(0)
}

async function recordAndOpenDubReview(page: import('@playwright/test').Page) {
  await page.goto('/library')
  await page.getByLabel('Search clips').fill('Dub this line 1')
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')

  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Stop' }).click()

  const toDubReview = page.getByRole('button', { name: 'Dub review' })
  await expect(toDubReview).toBeEnabled({ timeout: 20_000 })
  await toDubReview.click()
  await page.waitForURL('**/dub')
}

test('a take can be exported as a video of the learner over the original', async ({ page }) => {
  test.setTimeout(180_000)
  await publishVideoClip(page)
  await recordAndOpenDubReview(page)

  await page.getByRole('button', { name: 'Export this dub' }).click()
  // Sub-second work, but it is queued work: the screen says so while it waits.
  await expect(page.getByText(/Putting your voice on the picture/)).toBeVisible()

  const download = page.getByRole('link', { name: 'Download' })
  await expect(download).toBeVisible({ timeout: 60_000 })

  const href = await download.getAttribute('href')
  expect(href).toContain('.mp4')

  // A real file, with both halves of the job in it — the request goes through
  // the browser's cookies, so this is the same fetch the learner's click makes.
  const file = await page.request.get(href!)
  expect(file.status()).toBe(200)
  expect((await file.body()).length).toBeGreaterThan(1000)
})

test('the export survives a reload, rather than being made again', async ({ page }) => {
  test.setTimeout(180_000)
  await publishVideoClip(page)
  await recordAndOpenDubReview(page)

  await page.getByRole('button', { name: 'Export this dub' }).click()
  await expect(page.getByRole('link', { name: 'Download' })).toBeVisible({ timeout: 60_000 })

  await page.reload()

  // Straight to the file: it is recorded on the take, not held in the screen.
  await expect(page.getByRole('link', { name: 'Download' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Export this dub' })).toHaveCount(0)
})

test('a clip with no video says so rather than offering a dead button', async ({ page }) => {
  await resetServer(page)
  await asLearner(page)

  // A starter clip: no source recording, so no picture to dub onto.
  await page.goto('/library')
  await page.getByLabel('Search clips').fill('One step at a time')
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Stop' }).click()

  const toDubReview = page.getByRole('button', { name: 'Dub review' })
  await expect(toDubReview).toBeEnabled({ timeout: 20_000 })
  await toDubReview.click()
  await page.waitForURL('**/dub')

  const button = page.getByRole('button', { name: 'Export this dub' })
  await expect(button).toBeDisabled()
  await expect(button).toHaveAttribute('title', /no video to dub onto/)
})

/**
 * The design put "Save dub" in the Practice column, and it belongs there: a
 * learner who has just nailed a line should not have to go to another screen to
 * keep it.
 */
test('a take can be saved as a video from the practice screen', async ({ page }) => {
  test.setTimeout(180_000)
  await publishVideoClip(page)

  await page.goto('/library')
  await page.getByLabel('Search clips').fill('Dub this line 1')
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')

  // Nothing to save before there is a take.
  await expect(page.getByRole('button', { name: 'Save dub' })).toBeDisabled()

  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Stop' }).click()

  const save = page.getByRole('button', { name: 'Save dub' })
  await expect(save).toBeEnabled({ timeout: 20_000 })
  await save.click()

  const download = page.getByRole('link', { name: 'Download' })
  await expect(download).toBeVisible({ timeout: 60_000 })
  const href = await download.getAttribute('href')
  expect(href).toContain('.mp4')

  const file = await page.request.get(href!)
  expect(file.status()).toBe(200)
})

// The picture belongs in the frame the screen already has for it, not bolted on
// beside the buttons — which left two video areas and the picture in neither of
// the places a learner looks.
test('the practice screen shows the clip in its own frame', async ({ page }) => {
  test.setTimeout(180_000)
  await publishVideoClip(page)

  await page.goto('/library')
  await page.getByLabel('Search clips').fill('Dub this line 1')
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')

  await expect(page.locator('.practice-video video')).toBeVisible({ timeout: 20_000 })
  // One player on the screen, not two.
  await expect(page.locator('video')).toHaveCount(1)
})

// An audio clip has no picture, so the frame carries the clip's own face
// instead: the tint it is given everywhere else, which is what keeps it looking
// like itself rather than turning into an anonymous box the moment it is
// opened. No line printed on it — the line is directly below, with every word
// tappable, and that copy is the useful one.
test('a clip with no video wears its own tint in the frame', async ({ page }) => {
  await resetServer(page)
  await asLearner(page)

  await page.goto('/library')
  await page.getByLabel('Search clips').fill('One step at a time')
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')

  const face = page.locator('.practice-video .thumb-face')
  await expect(face).toBeVisible()
  await expect(face).toHaveText('')
  // Still no player, which is the part that matters: there is nothing to play.
  await expect(page.locator('video')).toHaveCount(0)
})
