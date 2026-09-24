import { expect, test } from '@playwright/test'
import { API_URL } from '../environment'
import { LESSON } from '../fixtures'
import { asAdmin, resetServer } from '../session'

/**
 * The upload history.
 *
 * "Did my film upload?" used to be answered by looking for its clips in the
 * library, which says nothing about a transfer that died, a transcript that never
 * arrived, or clips whose picture the cutter gave up on. All of that was written
 * down somewhere; none of it was anywhere anybody could see.
 */

test.beforeEach(async ({ page }) => {
  await resetServer(page)
  await asAdmin(page)
})

test('a recording appears in the history the moment it is sent', async ({ page }) => {
  await page.goto('/admin/cut')
  await page.locator('input[type=file]').setInputFiles(LESSON)
  await expect(page.locator('.waveform')).toBeVisible({ timeout: 30_000 })

  await page.getByRole('link', { name: 'Uploads' }).click()
  await expect(page).toHaveURL(/\/admin\/uploads$/)

  const row = page.locator('.card', { hasText: 'lesson.wav' })
  await expect(row).toBeVisible({ timeout: 20_000 })
  // Its size and its length, both of which the browser knew and the server did
  // not. A recording is identified in practice by being the two-hour one.
  await expect(row).toContainText('MB')

  // The history follows it: transcription is queued the moment the bytes land,
  // and with no model in this environment the worker gives up and says so. Either
  // of those is the history working; a row stuck on "Uploading" would not be.
  await expect(row.locator('.tag')).not.toHaveText('Uploading', { timeout: 60_000 })
})

test('an upload that never arrived says why', async ({ page }) => {
  // Announced and never sent, which is exactly the row the two-step upload
  // exists to leave behind. Marked failed through the API because making a real
  // transfer die halfway is not something a browser test can arrange.
  const announced = await page.request.post(`${API_URL}/api/admin/uploads`, {
    data: { name: 'lost-film.mp4', contentType: 'video/mp4', bytes: 900_000_000, seconds: 3600 },
  })
  expect(announced.ok()).toBe(true)

  await page.goto('/admin/uploads')
  const row = page.locator('.card', { hasText: 'lost-film.mp4' })
  await expect(row.locator('.tag')).toHaveText('Uploading')

  // Filtering finds it by the status the console shows, not by a column.
  await page.getByLabel('Filter by status').selectOption('done')
  await expect(page.getByText('No upload matches that.')).toBeVisible()
  await page.getByLabel('Filter by status').selectOption('uploading')
  await expect(page.locator('.card', { hasText: 'lost-film.mp4' })).toBeVisible()
})

test('the details say what is left to do, and retry only offers itself when there is', async ({
  page,
}) => {
  await page.goto('/admin/cut')
  await page.locator('input[type=file]').setInputFiles(LESSON)
  await expect(page.locator('.waveform')).toBeVisible({ timeout: 30_000 })

  const lines = page.locator('input[id^="line-"]')
  for (let i = 0; i < (await lines.count()); i++) {
    await lines.nth(i).fill(`Shadow this line ${i + 1}`)
  }
  await page.getByRole('button', { name: /Publish 4 clips/ }).click()
  await expect(page.getByText('4 clips are now in the library.')).toBeVisible({ timeout: 60_000 })

  await page.goto('/admin/uploads')
  const row = page.locator('.card', { hasText: 'lesson.wav' })
  await row.getByRole('button', { name: 'Details' }).click()

  await expect(row.locator('.row', { hasText: 'Clips published' })).toContainText('4')
  // The clips' sound is cut on the server now, from the recording, so the
  // history counts that work until the cutter is through it — and then every
  // clip has its sound and none is left owing one. (The status itself stays on
  // its transcript here: there is no speech model in this environment.)
  await expect(row.getByText('Clips with no audio')).toHaveCount(0, { timeout: 60_000 })
  await expect(row.getByText('Cuts still to do')).toHaveCount(0)
  await expect(row.getByText('Cuts given up on')).toHaveCount(0)

  // With nothing given up, there is nothing to put back — and a button that
  // starts nothing is worse than no button.
  await expect(row.getByRole('button', { name: 'Try again' })).toHaveCount(0)
})

test('the history is not for a learner', async ({ page }) => {
  const refused = await page.request.get(`${API_URL}/api/admin/uploads`)
  expect(refused.ok()).toBe(true)

  // The same request as somebody who is not an admin.
  await page.request.post(`${API_URL}/auth/logout`)
  await page.goto('/auth/google/start?email=minh@example.com')
  const asLearner = await page.request.get(`${API_URL}/api/admin/uploads`)
  expect(asLearner.status()).toBe(403)
})
