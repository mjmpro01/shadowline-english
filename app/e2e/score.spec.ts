import { expect, test } from '@playwright/test'
import { FLAT_CLIP, OVERLONG_CLIP, SOURCE_CLIP } from './fixtures'

/** Long enough for the fake microphone to play through most of the clip. */
const RECORD_MS = 2600

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await page.waitForURL('**/library')
})

async function recordOnce(page: import('@playwright/test').Page, label: 'Record' | 'Re-record') {
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.waitForTimeout(RECORD_MS)
  await page.getByRole('button', { name: 'Stop' }).click()
}

test('a take with no original audio is measured but not scored', async ({ page }) => {
  await page.getByRole('button', { name: 'Practice' }).first().click()
  await page.waitForURL('**/practice')

  await recordOnce(page, 'Record')

  await expect(page.getByText('Take measured')).toBeVisible()
  await expect(page.getByText('PITCH MATCH SCORE')).toHaveCount(0)
})

test('attaching the original audio scores the take against it', async ({ page }) => {
  await page.getByRole('button', { name: 'Practice' }).first().click()
  await page.waitForURL('**/practice')

  await page.locator('input[type=file]').setInputFiles(SOURCE_CLIP)
  await expect(page.getByRole('button', { name: 'Hear clip again' })).toBeEnabled()

  await recordOnce(page, 'Record')
  const scoreCard = page.locator('.card', { hasText: 'PITCH MATCH SCORE' })
  await expect(scoreCard).toBeVisible({ timeout: 20_000 })

  // The fixture shadows the source closely, so it should score well.
  const score = Number((await scoreCard.locator('div').last().innerText()).trim())
  expect(score).toBeGreaterThan(60)

  await page.getByRole('button', { name: 'See analysis' }).click()
  await page.waitForURL(/library\/[^/]+$/)

  await expect(page.locator('.tag', { hasText: 'measured' })).toBeVisible()
  const metrics = page.locator('.grid-scores .card')
  await expect(metrics).toHaveCount(4)
  await expect(page.getByText('semitones from the source')).toBeVisible()
})

test('both voices play on one timeline in dub review', async ({ page }) => {
  await page.getByRole('button', { name: 'Practice' }).first().click()
  await page.waitForURL('**/practice')
  await page.locator('input[type=file]').setInputFiles(SOURCE_CLIP)
  await recordOnce(page, 'Record')

  await page.getByRole('button', { name: 'Watch' }).click()
  await page.waitForURL('**/dub')

  await page.getByRole('button', { name: 'Play' }).click()
  await page.waitForTimeout(1200)
  const before = await page.evaluate(() => {
    const el = document.querySelector('audio')!
    return { src: el.currentSrc, time: el.currentTime }
  })
  expect(before.time).toBeGreaterThan(0.5)

  await page.getByText('Original', { exact: true }).click()
  await page.waitForTimeout(600)
  const after = await page.evaluate(() => {
    const el = document.querySelector('audio')!
    return { src: el.currentSrc, time: el.currentTime, paused: el.paused }
  })

  expect(after.src).not.toBe(before.src)
  expect(after.paused).toBe(false)
  // Switching voices keeps your place rather than restarting the line.
  expect(after.time).toBeGreaterThanOrEqual(before.time - 0.2)
})

test('each clip is scored against its own audio, not the last one seen', async ({ page }) => {
  // Navigation stays inside the app on purpose: a full page load would drop the
  // worker and its cached contour, which is exactly what this guards.
  const scoreFor = async (clipIndex: number, sourceFile: string) => {
    await page.getByRole('button', { name: 'Practice' }).nth(clipIndex).click()
    await page.waitForURL('**/practice')
    await page.locator('input[type=file]').setInputFiles(sourceFile)
    await recordOnce(page, 'Record')
    const card = page.locator('.card', { hasText: 'PITCH MATCH SCORE' })
    await expect(card).toBeVisible({ timeout: 20_000 })
    const score = Number((await card.locator('div').last().innerText()).trim())
    await page.getByRole('button', { name: 'Exit' }).click()
    await page.waitForURL('**/library')
    return score
  }

  // The microphone plays a shadow of the melodic clip both times.
  const melodic = await scoreFor(0, SOURCE_CLIP)
  const flat = await scoreFor(1, FLAT_CLIP)

  expect(melodic).toBeGreaterThan(60)
  // Reusing the first clip's contour here would score this just as highly.
  expect(flat).toBeLessThan(melodic - 10)
})

test('recording stops itself at the clip limit', async ({ page }) => {
  await page.getByRole('button', { name: 'Practice' }).first().click()
  await page.waitForURL('**/practice')

  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await expect(page.getByText('s left')).toBeVisible()

  // Never pressed: the recorder ends the take on its own.
  await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden({ timeout: 15_000 })
  await expect(page.getByText('Take measured')).toBeVisible({ timeout: 20_000 })
})

test('refuses source audio longer than a clip may be', async ({ page }) => {
  await page.getByRole('button', { name: 'Practice' }).first().click()
  await page.waitForURL('**/practice')

  await page.locator('input[type=file]').setInputFiles(OVERLONG_CLIP)
  await expect(page.getByText(/trim this to 6 seconds or less/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hear clip again' })).toBeDisabled()

  // A clip within the limit is still accepted afterwards.
  await page.locator('input[type=file]').setInputFiles(SOURCE_CLIP)
  await expect(page.getByRole('button', { name: 'Hear clip again' })).toBeEnabled()
})
