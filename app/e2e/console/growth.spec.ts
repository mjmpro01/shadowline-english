import { expect, test } from '@playwright/test'
import { asAdmin, asLearner, resetServer } from '../session'

// Who comes back: the console's own figures, from the days learners opened the
// app on.
test('the growth page counts who opened the app today', async ({ page }) => {
  await resetServer(page)
  await asLearner(page)
  await asAdmin(page)
  await page.goto('/admin/growth')
  await expect(page.getByRole('heading', { name: 'Growth', exact: true })).toBeVisible()
  const today = page.locator('.growth-tile', { hasText: 'Active today' }).locator('.growth-tile-value')
  await expect(today).toHaveText('2')
  await expect(page.getByTestId('cohorts')).toBeVisible()
  await expect(page.getByText('Signed up', { exact: true }).first()).toBeVisible()

  await page.locator('label.seg-opt', { hasText: '90 days' }).click()
  await expect(page.getByRole('heading', { name: "How far the last 90 days' new learners got" })).toBeVisible()
})
