import { expect, test } from '@playwright/test'
import { ADMIN_URL, APP_URL } from '../environment'
import { asAdmin, asLearner, resetServer } from '../session'

/**
 * The console's own way in.
 *
 * Signing out of the console used to land on the learner app's login, and
 * signing in there landed on the learner's dashboard. These check the round
 * trip stays in the console.
 */

test.beforeEach(async ({ page }) => {
  await resetServer(page)
})

test('signed out, the console sends you to its own login screen', async ({ page }) => {
  await page.goto('/admin/')
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
    'href',
    '/auth/google/start?from=admin',
  )
  await expect(page.getByLabel('Email')).toBeVisible()
})

test('a Google login started in the console comes back to the console', async ({ page }) => {
  // The fake provider takes the address to vouch for; Google would ask.
  await page.goto(`${ADMIN_URL}/auth/google/start?from=admin&email=admin@example.com`)
  await expect(page).toHaveURL(`${APP_URL}/admin/cut`)
  await expect(page.getByRole('heading', { name: 'Clip studio' })).toBeVisible()
})

test('signing out of the console lands on the console login', async ({ page }) => {
  await asAdmin(page)
  await page.goto('/admin/cut')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible()
})

test('a learner who reaches the console login is told, and can switch accounts', async ({ page }) => {
  await asLearner(page)
  await page.goto('/admin/login')
  await expect(page.getByRole('alert')).toContainText('is not an admin account')
  await page.getByRole('button', { name: 'Sign in with another account' }).click()
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible()
})
