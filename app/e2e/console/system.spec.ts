import { expect, test } from '@playwright/test'
import { asAdmin, resetServer } from '../session'

/**
 * The System page: which code every part runs, side by side, so a part left
 * running from before a pull shows as the one that differs.
 *
 * The test stack runs the API, the console and four workers from this one
 * checkout, so they all report the same commit; the transcriber is not run
 * here at all, so it has never reported in.
 */

test.beforeEach(async ({ page }) => {
  await resetServer(page)
  await asAdmin(page)
})

test('every part says which code it runs, and the ones that agree say so', async ({ page }) => {
  await page.goto('/admin/system')
  const row = (name: string) => page.locator('tr', { has: page.getByRole('cell', { name, exact: true }) })

  await expect(row('Admin console')).toContainText('Same as the API')
  await expect(row('API server')).toContainText('Same as the API')
  // The workers beat every ten seconds, so give the first beat time to land.
  await expect(row('Cutter')).toContainText('Same as the API', { timeout: 20_000 })
  await expect(row('Scorer')).toContainText('Same as the API')
  await expect(row('Transcriber')).toContainText('Never reported in')

  // Each version is a commit: seven hex characters, maybe marked dirty.
  await expect(row('API server').locator('td').nth(1)).toHaveText(/^[0-9a-f]{7}(-dirty)?$/)
  // Not everything is running, so the page says how to bring parts up to date.
  await expect(page.getByText('How to bring a part up to date')).toBeVisible()
})

test('the menu shows the console version and leads to the System page', async ({ page }) => {
  await page.goto('/admin/cut')
  const link = page.locator('.menu-version')
  await expect(link).toHaveText(/^Version [0-9a-f]{7}(-dirty)?/)
  await link.click()
  await expect(page).toHaveURL(/\/admin\/system$/)
  await expect(page.getByRole('heading', { name: 'System' })).toBeVisible()
})
