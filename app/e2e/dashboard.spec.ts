import { expect, test } from '@playwright/test'
import { asAdmin, asLearner, startFresh } from './session'
import { feature, publishLesson } from './seed'

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
  await page.getByLabel('Search the library').fill('Shadow this line 1')
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')
}

// A new learner is given one thing to do, not four tiles of zeros and a
// leaderboard of nobody.
test('signing in for the first time lands on a first step', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Start your journey' })).toBeVisible()
  await expect(page.locator('.stat-tile')).toHaveCount(0)
})

// The four invented peers are gone, and so is the empty board: an app nobody
// has scored in ranks nobody, and says nothing about it.
test('the leaderboard is not shown until someone has a scored take', async ({ page }) => {
  await expect(page.getByText('Leaderboard', { exact: true })).toHaveCount(0)
  await expect(page.getByText('(You)')).toHaveCount(0)
})

test('the first step leads straight into practising a featured clip', async ({ page }) => {
  await publishLesson(page)
  await feature(page, 'Shadow this line 1')
  await asLearner(page)
  await page.getByRole('button', { name: 'Practise my first line' }).click()
  await expect(page).toHaveURL(/\/practice$/)
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeVisible()
})

test('a scored take puts you on the leaderboard and counts a day of practice', async ({ page }) => {
  const tile = (label: string) => page.locator('.stat-tile', { hasText: label }).locator('.mono')

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
  await expect(page.getByRole('heading', { name: 'Start your journey' })).toHaveCount(0)
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

  // Featured through the API: what this test is about is the dashboard, and the
  // console's own button for it is covered where that button lives.
  await feature(page, 'Shadow this line 1')

  await asLearner(page)
  await page.goto('/dashboard')
  const featured = page.locator('.grid-cards .card').filter({ hasText: 'Shadow this line 1' })
  await expect(featured).toBeVisible()

  await featured.getByRole('button', { name: 'Practice', exact: true }).click()
  await expect(page).toHaveURL(/\/practice$/)
})
