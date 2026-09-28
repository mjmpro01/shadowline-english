import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { LESSON } from '../fixtures'
import { asAdmin, resetServer } from '../session'
import { publishLesson } from '../seed'

/**
 * The studio saying what a series name and a file will do before they are
 * published: "fiends" for "friends" used to make a second series quietly, and
 * the same file published twice put the same lines in the library twice.
 */

test.beforeEach(async ({ page }) => {
  await resetServer(page)
  // "Lesson one", cut from lesson.wav.
  await publishLesson(page)
  await asAdmin(page)
  await page.goto('/admin/cut')
  await page.locator('input[type=file]').setInputFiles({
    name: 'lesson.wav',
    mimeType: 'audio/wav',
    buffer: readFileSync(LESSON),
  })
  await expect(page.locator('.waveform')).toBeVisible({ timeout: 30_000 })
})

test('a file published before says so', async ({ page }) => {
  await expect(page.getByText(/already published, in "Lesson one"/)).toBeVisible()
})

test('a near miss on a series name is caught, and one click fixes it', async ({ page }) => {
  const name = page.locator('#playlist')
  await name.fill('Leson one')
  await expect(page.getByText(/There is a series called "Lesson one"/)).toBeVisible()

  await page.getByRole('button', { name: 'Use "Lesson one"' }).click()
  await expect(name).toHaveValue('Lesson one')
  await expect(page.getByText(/Joins the series "Lesson one"/)).toBeVisible()

  await name.fill('Lesson two')
  await expect(page.getByText('Starts a new series.')).toBeVisible()
})
