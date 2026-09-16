import { expect, test } from '@playwright/test'
import { publishLesson } from './studio'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await page.waitForURL('**/dashboard')
})

test('signing in lands on the dashboard', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.locator('.stat-tile', { hasText: 'Clips practised' })).toBeVisible()
  await expect(page.locator('.stat-tile', { hasText: 'Day streak' })).toBeVisible()
})

test('your leaderboard row is real while the others are labelled as samples', async ({ page }) => {
  await expect(page.getByText('other learners are sample data')).toBeVisible()
  await expect(page.getByText('(You)')).toBeVisible()

  // Nothing has been scored yet, so there is no average to rank on.
  const you = page.locator('tr', { hasText: '(You)' })
  await expect(you).toBeVisible()
})

test('a scored take moves you up the leaderboard and counts a day of practice', async ({ page }) => {
  const tile = (label: string) => page.locator('.stat-tile', { hasText: label }).locator('.mono')
  const before = {
    streak: Number(await tile('Day streak').innerText()),
    takes: Number(await tile('Takes recorded').innerText()),
  }

  await publishLesson(page)
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await page.waitForTimeout(2600)
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.locator('.card', { hasText: 'PITCH MATCH SCORE' })).toBeVisible({ timeout: 20_000 })

  await page.goto('/dashboard')
  // The sample history runs up to yesterday, so practising today extends it.
  await expect(tile('Day streak')).toHaveText(String(before.streak + 1))
  await expect(tile('Takes recorded')).toHaveText(String(before.takes + 1))

  // You now have an average to be ranked on; where that lands depends on the
  // score, so this does not assume a podium place.
  await expect(tile('Average score')).not.toHaveText('—')
  await expect(page.getByText('(You)')).toBeVisible()
})

test('featured clips come from the studio and lead straight into practice', async ({ page }) => {
  await publishLesson(page)

  await page.goto('/admin')
  await page.getByText('Clips (', { exact: false }).click()
  await page.getByRole('button', { name: 'Feature', exact: true }).first().click()
  await expect(page.getByRole('button', { name: 'Featured', exact: true }).first()).toBeVisible()

  await page.goto('/dashboard')
  const featured = page.locator('.grid-cards .card')
  await expect(featured.first()).toBeVisible()
  await expect(page.getByText('Shadow this line 1')).toBeVisible()

  await featured.first().getByRole('button', { name: 'Practice', exact: true }).click()
  await expect(page).toHaveURL(/\/practice$/)
})
