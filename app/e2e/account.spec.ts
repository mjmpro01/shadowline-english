import { expect, test } from '@playwright/test'
import { API_URL, APP_URL } from './environment'
import { asLearner, resetServer } from './session'

/**
 * A learner's own account: taking their data away, and closing it for good.
 */

test.beforeEach(async ({ page }) => {
  await resetServer(page)
  await asLearner(page)
})

test('a learner can download everything kept about them', async ({ page }) => {
  await page.goto('/profile')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download my data' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^shadowline-\d{4}-\d{2}-\d{2}\.json$/)
  const exported = JSON.parse(await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()))
  expect(exported.profile.email).toBe('minh@example.com')
  expect(Array.isArray(exported.takes)).toBe(true)
})

test('deleting an account needs the address typed, and signs the learner out', async ({ page }) => {
  await page.goto('/profile')
  // No password to change: this environment has no Keycloak.
  await expect(page.getByRole('button', { name: 'Change password' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Delete my account' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' })
  const confirm = dialog.getByRole('button', { name: 'Delete for good' })
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(/Type minh@example.com to confirm/).fill('minh@example.com')
  await confirm.click()

  await expect(page).toHaveURL(`${APP_URL}/login`)
  const me = await page.request.get(`${API_URL}/auth/me`)
  expect((await me.json()).user).toBeNull()
})
