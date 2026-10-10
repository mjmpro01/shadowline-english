import { expect, test } from '@playwright/test'
import { LEARNER_EMAIL } from './environment'
import { resetServer, signIn } from './session'

test.beforeEach(async ({ page }) => {
  await resetServer(page)
})

/**
 * Google's OAuth verification reads the home page: it must name the app as
 * the consent screen does, explain what it is for, and not sit behind a login.
 */
test('the home page explains Shadowline English without an account', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/')

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Shadowline English' })).toBeVisible()
  await expect(page.getByText('Practise speaking English by shadowing')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible()
  await expect(page.locator('footer').getByRole('link', { name: 'Privacy Policy' })).toBeVisible()
  await expect(page.locator('footer').getByRole('link', { name: 'Terms of Service' })).toBeVisible()

  await page.getByRole('link', { name: 'Get started — it is free' }).first().click()
  await expect(page).toHaveURL(/\/login$/)
})

test('the page Google fetches says what the app is before any script runs', async ({
  request,
}) => {
  const html = await (await request.get('/')).text()
  expect(html).toContain('<h1>Shadowline English</h1>')
  expect(html).toContain('practise speaking English by shadowing')
  expect(html).toContain('href="/privacy"')
})

test('a learner who is signed in goes from the home page to practice', async ({ page }) => {
  await signIn(page, LEARNER_EMAIL)
  await page.goto('/')
  await page.waitForURL('**/dashboard')
})
