import { expect, test } from '@playwright/test'
import { API_URL, APP_URL } from '../environment'
import { asAdmin, resetServer, signIn } from '../session'

/**
 * Who may do what, from the console.
 *
 * Admin rights used to come only from ADMIN_EMAILS, re-applied at every
 * sign-in. The owners are still those addresses; everybody else is made an
 * admin, or suspended, here.
 */

test.beforeEach(async ({ page }) => {
  await resetServer(page)
  // Somebody to manage: a learner who has signed in once.
  await signIn(page, 'minh@example.com')
  await page.request.post(`${API_URL}/auth/logout`)
  await asAdmin(page)
})

test('an owner is shown, and cannot be changed from here', async ({ page }) => {
  await page.goto('/admin/users')
  const me = page.locator('tr', { hasText: 'admin@example.com' })
  await expect(me.getByText('Owner')).toBeVisible()
  await expect(me.getByText('You')).toBeVisible()
  await expect(me.getByRole('button', { name: 'Remove admin' })).toBeDisabled()
  await expect(me.getByRole('button', { name: 'Suspend' })).toBeDisabled()
})

test('a learner made an admin can open the console', async ({ page, browser }) => {
  await page.goto('/admin/users')
  const row = page.locator('tr', { hasText: 'minh@example.com' })
  await row.getByRole('button', { name: 'Make admin' }).click()
  await expect(row.getByText('Admin', { exact: true })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Remove admin' })).toBeVisible()

  // Their own browser, signing in afresh: the grant survives it.
  const theirs = await browser.newContext()
  const them = await theirs.newPage()
  await signIn(them, 'minh@example.com')
  const list = await them.request.get(`${API_URL}/api/admin/users`)
  expect(list.status()).toBe(200)
  await theirs.close()
})

test('a suspended learner is turned away at sign-in, with the reason', async ({ page, browser }) => {
  await page.goto('/admin/users')
  const row = page.locator('tr', { hasText: 'minh@example.com' })
  await row.getByRole('button', { name: 'Suspend' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Suspend' }).click()
  await expect(row.getByText('Suspended')).toBeVisible()

  const theirs = await browser.newContext()
  const them = await theirs.newPage()
  await them.goto(`${API_URL}/auth/google/start?email=${encodeURIComponent('minh@example.com')}`)
  await expect(them).toHaveURL(`${APP_URL}/login?error=suspended`)
  await expect(them.getByText('This account has been suspended')).toBeVisible()
  await theirs.close()

  await page.getByLabel('Show').selectOption('suspended')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await row.getByRole('button', { name: 'Restore' }).click()
  await expect(row.getByText('Suspended')).toHaveCount(0)
})
