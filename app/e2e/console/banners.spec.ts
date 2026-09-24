import { expect, test } from '@playwright/test'
import { API_URL, APP_URL } from '../environment'
import { asAdmin, resetServer, signIn } from '../session'

/**
 * An announcement, from the console to a learner's dashboard.
 */

test.beforeEach(async ({ page }) => {
  await resetServer(page)
  await asAdmin(page)
})

test('a banner written in the console reaches a learner, who can close it', async ({ page, browser }) => {
  await page.goto('/admin/banners')
  await expect(page.getByText('No banners yet.')).toBeVisible()

  await page.getByRole('button', { name: 'New banner' }).click()
  const form = page.getByRole('dialog', { name: 'New banner' })
  await form.getByLabel('Title').fill('IELTS week')
  await form.getByLabel('Text').fill('Five new lecture clips, all about the listening test.')
  await form.getByLabel('Link', { exact: true }).fill('/library')
  await form.getByLabel('Button label').fill('Open the library')
  await form.getByRole('button', { name: 'Save' }).click()

  // A new banner stays open, now able to take a picture.
  await expect(page.getByRole('dialog', { name: 'Edit banner' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  const row = page.locator('.card', { hasText: 'IELTS week' })
  await expect(row.getByText('Showing')).toBeVisible()

  const theirs = await browser.newContext()
  const learner = await theirs.newPage()
  await signIn(learner, 'minh@example.com')
  const shown = learner.getByRole('region', { name: 'IELTS week' })
  await expect(shown).toBeVisible()
  await expect(shown).toContainText('Five new lecture clips')

  // The button goes where the admin pointed it, inside the app.
  await shown.getByRole('link', { name: 'Open the library' }).click()
  await expect(learner).toHaveURL(`${APP_URL}/library`)

  // Closed, and still closed on the next visit.
  await learner.goto(`${APP_URL}/dashboard`)
  await learner.getByRole('region', { name: 'IELTS week' }).getByRole('button', { name: 'Close this announcement' }).click()
  await expect(learner.getByRole('region', { name: 'IELTS week' })).toHaveCount(0)
  await learner.reload()
  await expect(learner.getByText('Clips worth practising')).toBeVisible()
  await expect(learner.getByRole('region', { name: 'IELTS week' })).toHaveCount(0)
  await theirs.close()
})

test('a banner turned off, or not started yet, is not shown', async ({ page }) => {
  const soon = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  for (const banner of [
    { title: 'Off for now', placement: 'dashboard', enabled: false },
    { title: 'Tomorrow', placement: 'dashboard', enabled: true, startsAt: soon },
  ]) {
    const made = await page.request.post(`${API_URL}/api/admin/banners`, { data: banner })
    expect(made.status()).toBe(201)
  }
  await page.goto('/admin/banners')
  await expect(page.locator('.card', { hasText: 'Off for now' }).getByText('Off', { exact: true })).toBeVisible()
  await expect(page.locator('.card', { hasText: 'Tomorrow' }).getByText('Scheduled')).toBeVisible()

  const live = await page.request.get(`${API_URL}/api/banners?placement=dashboard&locale=en`)
  expect(await live.json()).toEqual([])
})
