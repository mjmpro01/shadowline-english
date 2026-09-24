import { expect, test } from '@playwright/test'
import { API_URL } from '../environment'
import { asAdmin, resetServer } from '../session'

/**
 * What the tutor costs, in the console.
 *
 * Asked through the real endpoint, against the stand-in router: the row this
 * page reads is the same one the limit counts, so a question that shows here is
 * one the limit saw.
 */

test.beforeEach(async ({ page }) => {
  await resetServer(page)
  await asAdmin(page)
})

test('a question to the tutor shows up in its usage', async ({ page }) => {
  await page.goto('/admin/tutor')
  await expect(page.getByText('Nobody has asked the tutor anything')).toBeVisible()

  // An admin practises too; their question counts like anybody's.
  for (const question of ['What does "break the ice" mean?', 'And "spill the beans"?']) {
    const asked = await page.request.post(`${API_URL}/api/tutor/chat`, {
      data: { messages: [{ role: 'user', content: question }] },
    })
    expect(asked.ok()).toBe(true)
    await asked.body()
  }

  await page.reload()
  await expect(page.getByText('2 questions')).toBeVisible()
  const learner = page.locator('tr', { hasText: 'admin@example.com' })
  await expect(learner).toBeVisible()
  await expect(learner.locator('td.num').first()).toHaveText('2')
  // And the limit it is held to, from the server rather than written in here.
  await expect(page.getByText(/30 questions per 10 minutes/)).toBeVisible()
})

test('the usage is not for a learner', async ({ page }) => {
  await page.request.post(`${API_URL}/auth/logout`)
  await page.goto(`${API_URL}/auth/google/start?email=minh@example.com`)
  const refused = await page.request.get(`${API_URL}/api/admin/tutor/usage`)
  expect(refused.status()).toBe(403)
})
