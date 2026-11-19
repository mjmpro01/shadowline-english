import { expect, test } from '@playwright/test'
import { asLearner, startFresh } from './session'
import { publishLesson } from './seed'

test.beforeEach(async ({ page }) => {
  await startFresh(page)
})

async function recordATake(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/library')
  await page.getByLabel('Search the library').fill('Shadow this line 1')
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await page.waitForTimeout(2600)
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeVisible({ timeout: 20_000 })
}

// A take is the day's first learning: the ring moves, the streak starts, and
// the learner is asked once how much a day they mean to do.
test('a take fills the day and starts the streak', async ({ page }) => {
  await publishLesson(page)
  await asLearner(page)
  await expect(page.getByRole('heading', { name: 'Today' })).toHaveCount(0)

  await recordATake(page)
  await page.goto('/dashboard')
  const card = page.locator('.today-card')
  await expect(card.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(card.getByRole('progressbar', { name: '2 of 20 points today' })).toBeVisible()
  await expect(card.getByTestId('today-status')).toHaveText("18 more points to reach today's goal.")
  await expect(card.getByTestId('today-streak')).toContainText('1-day streak')
  await expect(page.locator('.stat-tile', { hasText: 'Day streak' }).locator('.mono')).toHaveText('1')
  await expect(card.getByRole('button', { name: /^Practise next:/ })).toBeVisible()

  // Asked once; chosen, the question goes.
  await card.getByRole('button', { name: 'Light · 10 pts' }).click()
  await expect(card.getByRole('progressbar', { name: '2 of 10 points today' })).toBeVisible()
  await expect(card.getByRole('group', { name: 'Daily goal' })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.today-card').getByRole('group', { name: 'Daily goal' })).toHaveCount(0)

  // And it is changed in the profile.
  await page.goto('/profile')
  const goal = page.getByRole('group', { name: 'Daily goal' })
  await expect(goal.getByRole('button', { name: 'Light · 10 pts' })).toHaveAttribute('aria-pressed', 'true')
  await goal.getByRole('button', { name: 'Keen · 40 pts' }).click()
  await expect(goal.getByRole('button', { name: 'Keen · 40 pts' })).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/dashboard')
  await expect(page.locator('.today-card').getByRole('progressbar', { name: '2 of 40 points today' })).toBeVisible()
})

test('the next clip on the list leads straight into practice', async ({ page }) => {
  await publishLesson(page)
  await asLearner(page)
  await recordATake(page)
  await page.goto('/dashboard')
  await page.locator('.today-card').getByRole('button', { name: /^Practise next:/ }).click()
  await expect(page).toHaveURL(/\/library\/[^/]+\/practice$/)
})
