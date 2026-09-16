import { expect, type Page } from '@playwright/test'
import { LESSON } from './fixtures'
import { asAdmin } from './session'

/**
 * Publishes the lesson fixture as library clips, as an admin.
 *
 * Clips reach learners only through the studio, so the practice tests have to
 * go through it too. Signing in as the admin is part of that: the studio is
 * closed to anyone the server did not mark, and there is no switch to flip.
 */
export async function publishLesson(page: Page): Promise<void> {
  await asAdmin(page)
  await page.goto('/admin')

  await page.locator('input[type=file]').setInputFiles(LESSON)
  await expect(page.locator('.waveform-segment')).toHaveCount(4, { timeout: 15_000 })

  await page.getByLabel('Playlist').fill('Lesson one')
  await page.getByLabel('Categories for the batch').fill('interview, daily')
  await page.getByRole('button', { name: 'Apply to all clips' }).click()

  const inputs = page.locator('input[id^="line-"]')
  for (let i = 0; i < (await inputs.count()); i++) {
    await inputs.nth(i).fill(`Shadow this line ${i + 1}`)
  }

  await page.getByRole('button', { name: /Publish 4 clips/ }).click()
  await expect(page.getByText('4 clips are now in the library.')).toBeVisible({ timeout: 30_000 })
  await page.goto('/library')
}
