import { expect, test } from '@playwright/test'
import { API_URL, LEARNER_EMAIL } from './environment'
import { resetServer, signIn } from './session'

test.beforeEach(async ({ page }) => {
  await resetServer(page)
})

/**
 * A login that fails has to end somewhere the learner can act on.
 *
 * The callback is a browser navigation, not a fetch, so before this the browser
 * simply stopped on the API's origin showing `{"error":...}` — no Shadowline
 * around it and nothing to click. These tests follow the redirect the whole way
 * and check what is on screen at the end of it.
 */

test('a callback the server never started sends the learner back to the login screen', async ({
  page,
}) => {
  await page.goto(`${API_URL}/auth/google/callback?state=forged.9999999999.nope&code=x`)

  await page.waitForURL('**/login?error=expired')
  await expect(page.getByRole('alert')).toContainText('expired')
  // The way out is on screen, not in the browser's back button.
  await expect(page.getByRole('link', { name: 'Try Google again' })).toBeVisible()
})

test('declining at Google says so, rather than blaming the link', async ({ page }) => {
  // What Google sends back when the learner presses Cancel: an error and no
  // code. They never had a session, so this is the whole flow.
  await page.goto(`${API_URL}/auth/google/callback?error=access_denied`)

  await page.waitForURL('**/login?error=cancelled')
  await expect(page.getByRole('alert')).toContainText('cancelled')
})

test('the error clears once the learner signs in', async ({ page }) => {
  await page.goto(`${API_URL}/auth/google/callback?state=forged.9999999999.nope&code=x`)
  await page.waitForURL('**/login?error=expired')
  await expect(page.getByRole('alert')).toBeVisible()

  await signIn(page, LEARNER_EMAIL)

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('the login screen is clean when nothing has gone wrong', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
