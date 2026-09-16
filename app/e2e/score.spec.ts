import { expect, test } from '@playwright/test'
import { publishLesson } from './studio'

/** Long enough for the fake microphone to play through most of the clip. */
const RECORD_MS = 2600

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await page.waitForURL('**/dashboard')
  await page.goto('/library')
})

async function recordOnce(page: import('@playwright/test').Page, label: 'Record' | 'Re-record') {
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.waitForTimeout(RECORD_MS)
  await page.getByRole('button', { name: 'Stop' }).click()
}

async function practise(page: import('@playwright/test').Page, clipIndex: number) {
  await page.getByRole('button', { name: 'Practice', exact: true }).nth(clipIndex).click()
  await page.waitForURL('**/practice')
}

async function scoreOf(page: import('@playwright/test').Page): Promise<number> {
  const card = page.locator('.card', { hasText: 'PITCH MATCH SCORE' })
  await expect(card).toBeVisible({ timeout: 20_000 })
  return Number((await card.locator('div').last().innerText()).trim())
}

test('a seeded clip has no original audio, so a take is measured but not scored', async ({ page }) => {
  await practise(page, 0)
  await recordOnce(page, 'Record')

  await expect(page.getByText('Take measured')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('PITCH MATCH SCORE')).toHaveCount(0)
})

test('a published clip scores takes against its own audio', async ({ page }) => {
  await publishLesson(page)
  await practise(page, 0)
  await expect(page.getByRole('button', { name: 'Hear clip again' })).toBeEnabled()

  await recordOnce(page, 'Record')
  // The fixture shadows the melodic line closely, so it should score well.
  expect(await scoreOf(page)).toBeGreaterThan(60)

  await page.getByRole('button', { name: 'See analysis' }).click()
  await page.waitForURL(/library\/[^/]+$/)

  await expect(page.locator('.tag', { hasText: 'measured' })).toBeVisible()
  await expect(page.locator('.grid-scores .card')).toHaveCount(4)
  await expect(page.getByText('semitones from the source')).toBeVisible()
})

test('each clip is scored against its own audio, not the last one seen', async ({ page }) => {
  await publishLesson(page)

  // Navigation stays inside the app on purpose: a full page load would drop the
  // worker and its cached contour, which is exactly what this guards.
  const scoreClip = async (index: number) => {
    await practise(page, index)
    await recordOnce(page, 'Record')
    const score = await scoreOf(page)
    await page.getByRole('button', { name: 'Exit' }).click()
    await page.waitForURL('**/library')
    return score
  }

  // The microphone plays a shadow of the melodic line both times; the second
  // published clip is flat, so it cannot score as well.
  const melodic = await scoreClip(0)
  const flat = await scoreClip(1)

  expect(melodic).toBeGreaterThan(60)
  expect(flat).toBeLessThan(melodic - 10)
})

test('both voices play on one timeline in dub review', async ({ page }) => {
  await publishLesson(page)
  await practise(page, 0)
  await recordOnce(page, 'Record')
  await expect(page.getByRole('button', { name: 'Watch' })).toBeEnabled({ timeout: 20_000 })

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

test('recording stops itself at the clip limit', async ({ page }) => {
  await practise(page, 0)

  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await expect(page.getByText('s left')).toBeVisible()

  // Never pressed: the recorder ends the take on its own.
  await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden({ timeout: 15_000 })
  await expect(page.getByText('Take measured')).toBeVisible({ timeout: 20_000 })
})

test('learners can search the library and filter it by category', async ({ page }) => {
  await publishLesson(page)

  await page.getByLabel('Search clips').fill('line 3')
  await expect(page.locator('.grid-cards .card')).toHaveCount(1)
  await expect(page.getByText('Shadow this line 3')).toBeVisible()

  await page.getByLabel('Search clips').fill('nothing like this')
  await expect(page.getByText(/Nothing matches that/)).toBeVisible()

  await page.getByLabel('Search clips').fill('')
  await page.getByRole('button', { name: 'Lesson one', exact: true }).click()
  // The four published clips share a playlist; the seeded ones do not.
  await expect(page.locator('.grid-cards .card')).toHaveCount(4)

  await page.getByRole('button', { name: 'interview', exact: true }).click()
  await expect(page.locator('.grid-cards .card')).toHaveCount(4)
})
