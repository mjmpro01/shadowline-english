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

test('an API from before versions says so, rather than taking the page down', async ({ page }) => {
  // What an API left running from before versions answers: two workers, no
  // version of its own. The console built after it used to crash on this.
  const seenAt = new Date().toISOString()
  await page.route('**/api/admin/services', (route) =>
    route.fulfill({
      json: {
        transcribing: null,
        cutting: { service: 'cutting', seenAt, busy: false, online: true },
      },
    }),
  )
  await page.goto('/admin/system')
  const row = (name: string) => page.locator('tr', { has: page.getByRole('cell', { name, exact: true }) })

  await expect(page.getByRole('status').filter({ hasText: 'Restart it on the current code first' })).toBeVisible()
  await expect(row('API server')).toContainText('Version unknown (old)')
  await expect(row('Cutter')).toContainText('Version unknown (old)')
  await expect(row('Transcriber')).toContainText('Never reported in')
  await expect(row('Scorer')).toContainText('Not asked by this API')
  // And the menu marks it, on every page.
  await expect(page.locator('.menu-version')).toHaveAttribute('data-behind', 'true')
})

// A state is one label, not three lines squeezed into the last column.
test('on a phone each state stays on one line', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/system')
  const tags = page.locator('.table .tag')
  await expect(tags.first()).toBeVisible()
  for (const height of await tags.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height)))
    expect(height).toBeLessThan(30)
})
