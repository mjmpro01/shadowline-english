import { expect, type Page } from '@playwright/test'

/**
 * Walks into the first clip in the library and starts practising it.
 *
 * The library is a tree, so reaching a clip is three clicks rather than one:
 * series, episode, clip. Tests that are about something else — words,
 * vocabulary, the dashboard — go through here rather than each knowing the
 * shape of the library.
 */
export async function practiseFirstClip(page: Page): Promise<void> {
  await page.goto('/library')
  await page.locator('.series-card').first().click()
  await page.waitForURL('**/library/s/**')
  await page.locator('.episode-row').first().click()
  await page.waitForURL('**/library/e/**')
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')
  await expect(page.locator('.caption-word').first()).toBeVisible()
}
