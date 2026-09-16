import { expect, test } from '@playwright/test'
import { asAdmin, asLearner, startFresh } from './session'
import { publishLesson } from './studio'

test.beforeEach(async ({ page }) => {
  await startFresh(page)
})

/**
 * Opens the first published clip. The starter clips come first in the library
 * and carry no audio, so practising `.first()` would measure a take that can
 * never be scored — which is a real state, but not the one these tests are for.
 */
async function practisePublished(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/library')
  await page.getByLabel('Search clips').fill('Shadow this line 1')
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')
}

test('signing in lands on the dashboard', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.locator('.stat-tile', { hasText: 'Clips practised' })).toBeVisible()
  await expect(page.locator('.stat-tile', { hasText: 'Day streak' })).toBeVisible()
})

// The four invented peers are gone. An app nobody has scored in ranks nobody,
// rather than showing a plausible crowd.
test('the leaderboard is empty until someone has a scored take', async ({ page }) => {
  await expect(page.getByText('Nobody has a scored take yet')).toBeVisible()
  await expect(page.getByText('(You)')).toHaveCount(0)
})

test('a scored take puts you on the leaderboard and counts a day of practice', async ({ page }) => {
  const tile = (label: string) => page.locator('.stat-tile', { hasText: label }).locator('.mono')
  await expect(tile('Takes recorded')).toHaveText('0')

  await publishLesson(page)
  await asLearner(page)
  await practisePublished(page)
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await page.waitForTimeout(2600)
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.locator('.card', { hasText: 'PITCH MATCH SCORE' })).toBeVisible({ timeout: 20_000 })

  await page.goto('/dashboard')
  await expect(tile('Takes recorded')).toHaveText('1')
  await expect(tile('Day streak')).toHaveText('1')
  await expect(tile('Clips practised')).toHaveText('1')

  // The row is the server's, computed from the take that was just scored.
  await expect(tile('Average score')).not.toHaveText('—')
  await expect(page.getByText('(You)')).toBeVisible()
  await expect(page.getByText('Nobody has a scored take yet')).toHaveCount(0)
})

// Two learners, two rows, each seeing their own marked. The old dashboard could
// not show this at all: the peers were constants in the frontend.
test('another learner appears on the board only once they have a score', async ({ page }) => {
  await publishLesson(page)

  await asLearner(page)
  await practisePublished(page)
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await page.waitForTimeout(2600)
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.locator('.card', { hasText: 'PITCH MATCH SCORE' })).toBeVisible({ timeout: 30_000 })

  await page.goto('/dashboard')
  await expect(page.locator('.podium .card')).toHaveCount(1)

  // The admin published the clips but has never recorded anything.
  await asAdmin(page)
  await expect(page.locator('.podium .card')).toHaveCount(1)
  await expect(page.getByText('(You)')).toHaveCount(0)
})

test('featured clips come from the studio and lead straight into practice', async ({ page }) => {
  await publishLesson(page)

  await page.goto('/admin')
  await page.getByText('Clips (', { exact: false }).click()
  // The starter clips are in this list too, and two of them ship featured —
  // so the one to feature has to be found rather than taken off the top.
  await page.getByLabel('Find a clip').fill('Shadow this line 1')
  const row = page.locator('.card', { hasText: 'Name' }).first()
  await row.getByRole('button', { name: 'Feature', exact: true }).click()
  await expect(row.getByRole('button', { name: 'Featured', exact: true })).toBeVisible()

  await page.goto('/dashboard')
  const featured = page.locator('.grid-cards .card').filter({ hasText: 'Shadow this line 1' })
  await expect(featured).toBeVisible()

  await featured.getByRole('button', { name: 'Practice', exact: true }).click()
  await expect(page).toHaveURL(/\/practice$/)
})
