import { expect, type Page } from '@playwright/test'
import { LESSON } from './fixtures'

/**
 * Publishes the lesson fixture as library clips. Clips only reach learners
 * through the studio now, so the practice tests have to go through it too.
 */
export async function publishLesson(page: Page): Promise<void> {
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Off' }).click()
  await page.goto('/admin')

  await page.locator('input[type=file]').setInputFiles(LESSON)
  await expect(page.locator('.waveform-segment')).toHaveCount(4, { timeout: 15_000 })

  const inputs = page.locator('input[id^="line-"]')
  for (let i = 0; i < (await inputs.count()); i++) {
    await inputs.nth(i).fill(`Shadow this line ${i + 1}`)
  }

  await page.getByRole('button', { name: /Publish 4 clips/ }).click()
  await expect(page.getByText('4 clips are now in the library.')).toBeVisible({ timeout: 15_000 })
  await page.goto('/library')
}
