import { expect, test } from '@playwright/test'
import { LESSON } from './fixtures'
import { publishLesson } from './studio'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await page.waitForURL('**/dashboard')
  await page.goto('/library')
})

test('learners cannot add clips of their own', async ({ page }) => {
  await expect(page.getByPlaceholder(/Paste a YouTube/)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Clip studio' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')
  await expect(page.getByRole('button', { name: /source audio/ })).toHaveCount(0)
})

test('the clip studio is closed until it is switched on', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/library$/)

  await page.goto('/profile')
  await page.getByRole('button', { name: 'Off' }).click()
  await page.getByRole('link', { name: 'Clip studio' }).click()
  await expect(page).toHaveURL(/\/admin$/)
})

test('cuts a recording into lines and publishes them to the library', async ({ page }) => {
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Off' }).click()
  await page.goto('/admin')

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

  await page.goto('/library')
  await expect(page.getByText('Shadow this line 1')).toBeVisible()

  // A published clip carries its own audio, so takes against it are scored.
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')
  await expect(page.getByRole('button', { name: 'Hear clip again' })).toBeEnabled()
})

test('merging and deleting change what gets published', async ({ page }) => {
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Off' }).click()
  await page.goto('/admin')

  await page.locator('input[type=file]').setInputFiles(LESSON)
  await expect(page.locator('.waveform-segment')).toHaveCount(4, { timeout: 15_000 })

  await page.getByRole('button', { name: 'Delete' }).last().click()
  await expect(page.locator('.waveform-segment')).toHaveCount(3)

  await page.getByRole('button', { name: 'Merge next' }).first().click()
  await expect(page.locator('.waveform-segment')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /Publish 2 clips/ })).toBeVisible()
})

test('dragging a boundary changes the clip, without crossing its neighbour', async ({ page }) => {
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Off' }).click()
  await page.goto('/admin')

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
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Off' }).click()
  await page.goto('/admin')

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
  await publishLesson(page)

  await page.goto('/admin')
  await page.getByText('Clips (', { exact: false }).click()

  const first = page.locator('.card', { hasText: 'Name' }).first()
  await expect(first.getByLabel('Playlist')).toHaveValue('Lesson one')
  await expect(first.getByLabel('Categories')).toHaveValue('interview, daily')

  // Renaming here is what the learner sees in the library.
  await first.getByLabel('Name').fill('Greeting the interviewer')
  await first.getByLabel('Categories').fill('interview, greeting')
  // The inputs are driven by the store, so seeing the new values means the
  // edit round-tripped through it before this navigates away.
  await expect(first.getByLabel('Name')).toHaveValue('Greeting the interviewer')
  await expect(first.getByLabel('Categories')).toHaveValue('interview, greeting')

  await page.goto('/library')
  await expect(page.getByText('Greeting the interviewer')).toBeVisible()
  await expect(page.getByRole('button', { name: 'greeting', exact: true })).toBeVisible()
})

test('deleting a clip removes it from the library', async ({ page }) => {
  await publishLesson(page)
  await page.goto('/admin')
  await page.getByText('Clips (', { exact: false }).click()

  const before = await page.locator('.card', { hasText: 'Name' }).count()
  await page.getByRole('button', { name: 'Delete clip' }).first().click()
  await expect(page.locator('.card', { hasText: 'Name' })).toHaveCount(before - 1)

  await page.goto('/library')
  await expect(page.getByText('Shadow this line 1')).toHaveCount(0)
})
