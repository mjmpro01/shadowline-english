import { expect, test } from '@playwright/test'
import { APP_URL } from '../environment'
import { asAdmin, asLearner, resetServer } from '../session'
import { publishLesson } from '../seed'

/**
 * The console's Series section: the shelf rather than what is on it.
 *
 * Every test here does the same two things — change something about a series or
 * an episode, then check what a learner ends up seeing. `baseURL` is the console,
 * so APP_URL is how a test crosses over, and crossing over is the assertion.
 */

/** The lesson fixture is published under this name, from this file. */
const SERIES = 'Lesson one'

test.beforeEach(async ({ page }) => {
  await resetServer(page)
  await publishLesson(page)
})

async function openSeries(page: import('@playwright/test').Page) {
  await page.goto(`${APP_URL}/library`)
  await page.getByRole('button', { name: `Open ${SERIES}` }).click()
  await page.waitForURL('**/library/s/**')
}

test('an admin names a series, describes it and marks it hot', async ({ page }) => {
  await asAdmin(page)
  await page.goto('/admin/series')

  // By its slug, which is text on the card. The name is the value of an input,
  // and an input's value is not text content — filtering on it finds nothing.
  const card = page.locator('.card').filter({ hasText: '/lesson-one' })
  await card.getByLabel('About this series').fill('Ten seasons of it.')
  await card.getByLabel('About this series').press('Enter')
  await card.getByRole('button', { name: 'Mark hot' }).click()
  await expect(card.getByRole('button', { name: 'Hot', exact: true })).toBeVisible()

  // The learner sees both, and the hot one leads the library.
  await asLearner(page)
  await page.goto(`${APP_URL}/library`)
  await expect(page.locator('.series-card').first()).toContainText(SERIES)
  await expect(page.locator('.series-card').first()).toContainText('Hot')

  await openSeries(page)
  await expect(page.getByText('Ten seasons of it.')).toBeVisible()
})

test('an admin renames an episode from the file it was cut from', async ({ page }) => {
  await asAdmin(page)
  await page.goto('/admin/series')

  // By its slug, which is text on the card. The name is the value of an input,
  // and an input's value is not text content — filtering on it finds nothing.
  const card = page.locator('.card').filter({ hasText: '/lesson-one' })
  await card.getByRole('button', { name: /episode/ }).click()
  await card.getByLabel('Episode name').fill('S01E01 — The pilot')
  await card.getByLabel('Episode name').press('Enter')

  await asLearner(page)
  await openSeries(page)
  await expect(page.getByRole('button', { name: 'Open S01E01 — The pilot' })).toBeVisible()
})

test('an admin can undo a whole episode', async ({ page }) => {
  await asAdmin(page)
  await page.goto('/admin/series')

  const card = page.locator('.card').filter({ hasText: '/lesson-one' })
  await card.getByRole('button', { name: /episode/ }).click()
  await card.getByRole('button', { name: 'Delete episode' }).click()

  // The dialog says what goes, counted, rather than asking "are you sure?".
  await expect(page.getByText(/4 clips and the recording they were cut from/)).toBeVisible()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  await asLearner(page)
  await page.goto(`${APP_URL}/library`)
  await page.getByLabel('Search the library').fill('Shadow this line')
  await expect(page.getByText(/Nothing in the library matches/)).toBeVisible()
})

test('a series with clips in it is not deleted by accident', async ({ page }) => {
  await asAdmin(page)
  await page.goto('/admin/series')

  const card = page.locator('.card').filter({ hasText: '/lesson-one' })
  // Disabled rather than absent: a button that is not there teaches nobody why.
  await expect(card.getByRole('button', { name: 'Delete series' })).toBeDisabled()

  // Empty it, and the button opens.
  await card.getByRole('button', { name: /episode/ }).click()
  await card.getByRole('button', { name: 'Delete episode' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(card.getByRole('button', { name: 'Delete series' })).toBeEnabled()
  await card.getByRole('button', { name: 'Delete series' }).click()
  await expect(page.getByText(/is empty, so only the name goes/)).toBeVisible()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.locator('.card').filter({ hasText: '/lesson-one' })).toHaveCount(0)
})
