import { expect, test } from '@playwright/test'
import { APP_URL } from '../environment'
import { LESSON } from '../fixtures'
import { asAdmin, resetServer } from '../session'
import { publishLesson } from '../seed'

/**
 * The console's cut screen: a recording in, a batch of clips out.
 *
 * `baseURL` here is the console's own dev server, so a bare path is a console
 * path. Where a test checks what a learner ends up seeing it says APP_URL, and
 * that is the point of the assertion rather than an accident of routing.
 */

/** Opens the studio as an admin, with a fresh library behind it. */
async function openStudio(page: import('@playwright/test').Page): Promise<void> {
  await resetServer(page)
  await asAdmin(page)
  await page.goto('/admin/cut')
}

test('cuts a recording into lines and publishes them to the library', async ({ page }) => {
  await openStudio(page)

  await page.locator('input[type=file]').setInputFiles(LESSON)
  const segments = page.locator('.waveform-segment')
  await expect(segments).toHaveCount(4, { timeout: 15_000 })

  // Every proposal is a clip-length line, cut at the pauses.
  const lengths = await page.locator('.card .card-meta.mono').allInnerTexts()
  for (const label of lengths.filter((l) => l.includes('–'))) {
    const seconds = Number(label.match(/([\d.]+)s$/)?.[1])
    expect(seconds).toBeGreaterThan(0.8)
    expect(seconds).toBeLessThanOrEqual(6)
  }

  const inputs = page.locator('input[id^="line-"]')
  for (let i = 0; i < (await inputs.count()); i++) await inputs.nth(i).fill(`Shadow this line ${i + 1}`)

  await page.getByRole('button', { name: /Publish 4 clips/ }).click()
  await expect(page.getByText('4 clips are now in the library.')).toBeVisible({ timeout: 15_000 })

  await page.goto(`${APP_URL}/library`)
  await page.getByLabel('Search the library').fill('Shadow this line 1')
  await expect(page.getByText('Shadow this line 1')).toBeVisible()

  // A published clip carries its own audio, so takes against it are scored —
  // unlike the starter clips, which is why this searches rather than taking the
  // first card in the library.
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')
  await expect(page.getByRole('button', { name: 'Hear clip again' })).toBeEnabled()
})

test('merging and deleting change what gets published', async ({ page }) => {
  await openStudio(page)

  await page.locator('input[type=file]').setInputFiles(LESSON)
  await expect(page.locator('.waveform-segment')).toHaveCount(4, { timeout: 15_000 })

  await page.getByRole('button', { name: 'Delete' }).last().click()
  await expect(page.locator('.waveform-segment')).toHaveCount(3)

  await page.getByRole('button', { name: 'Merge next' }).first().click()
  await expect(page.locator('.waveform-segment')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /Publish 2 clips/ })).toBeVisible()
})

test('dragging a boundary changes the clip, without crossing its neighbour', async ({ page }) => {
  await openStudio(page)

  await page.locator('input[type=file]').setInputFiles(LESSON)
  await expect(page.locator('.waveform-segment')).toHaveCount(4, { timeout: 15_000 })

  const lengthOf = async (index: number) => {
    const label = await page.locator('.card .card-meta.mono').nth(index).innerText()
    return Number(label.match(/([\d.]+)s$/)?.[1])
  }
  const before = await lengthOf(0)

  const waveform = page.locator('.waveform')
  const box = (await waveform.boundingBox())!
  const handle = page.locator('.waveform-segment').first().locator('.waveform-handle').last()
  const from = (await handle.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  // Aim well past the next clip: the boundary should stop at it, not cross it.
  await page.mouse.move(box.x + box.width * 0.45, from.y + from.height / 2, { steps: 12 })
  await page.mouse.up()

  const after = await lengthOf(0)
  // Read both sides of the boundary from the labels: it should have stopped
  // exactly where the next clip begins.
  const firstEnd = (await page.locator('.card .card-meta.mono').first().innerText()).match(/–(\S+) /)?.[1]
  const secondStart = (await page.locator('.card .card-meta.mono').nth(1).innerText()).match(/^(\S+)–/)?.[1]
  expect(after).toBeGreaterThan(before)
  expect(firstEnd).toBe(secondStart)
})

test('a merge that overruns the limit blocks publishing until it is fixed', async ({ page }) => {
  await openStudio(page)

  await page.locator('input[type=file]').setInputFiles(LESSON)
  await expect(page.locator('.waveform-segment')).toHaveCount(4, { timeout: 15_000 })
  await expect(page.getByRole('button', { name: /Publish 4 clips/ })).toBeEnabled()

  // The last two lines together run past six seconds.
  await page.getByRole('button', { name: 'Merge next' }).nth(2).click()
  await expect(page.getByText(/longer than 6s/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Publish/ })).toBeDisabled()

  await page.getByRole('button', { name: 'Delete' }).last().click()
  await expect(page.getByText(/longer than 6s/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Publish 2 clips/ })).toBeEnabled()
})

test('clips get a name, a playlist and categories, and stay editable after publishing', async ({ page }) => {
  await resetServer(page)
  await publishLesson(page)

  await page.goto('/admin/clips')

  await page.getByLabel('Find a clip').fill('Shadow this line 1')
  const first = page.locator('.card', { hasText: 'Name' }).first()
  await expect(first.getByLabel('Playlist')).toHaveValue('Lesson one')
  await expect(first.getByLabel('Categories')).toHaveValue('interview, daily')

  // Renaming here is what the learner sees in the library.
  // The fields keep a draft and save when they lose focus, so pressing Enter
  // is what sends the change rather than each keystroke doing it.
  await first.getByLabel('Name').fill('Greeting the interviewer')
  await first.getByLabel('Name').press('Enter')
  await first.getByLabel('Categories').fill('interview, greeting')
  await first.getByLabel('Categories').press('Enter')

  await page.goto(`${APP_URL}/library`)
  await page.getByLabel('Search the library').fill('Greeting')
  await expect(page.getByText('Greeting the interviewer')).toBeVisible()
  await page.getByLabel('Search the library').fill('')
  await expect(page.getByRole('button', { name: 'greeting', exact: true })).toBeVisible()
})

test('deleting a clip removes it from the library', async ({ page }) => {
  await resetServer(page)
  await publishLesson(page)
  await page.goto('/admin/clips')

  // The search runs on the server now — the studio pages through the library
  // rather than filtering a copy of it.
  await page.getByLabel('Find a clip').fill('Shadow this line 1')
  await expect(page.locator('.card', { hasText: 'Name' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Delete clip' }).first().click()
  await expect(page.getByText(/its audio and every take/)).toBeVisible()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.locator('.card', { hasText: 'Name' })).toHaveCount(0)

  await page.goto(`${APP_URL}/library`)
  await page.getByLabel('Search the library').fill('Shadow this line 1')
  await expect(page.getByText(/Nothing in the library matches/)).toBeVisible()
})
