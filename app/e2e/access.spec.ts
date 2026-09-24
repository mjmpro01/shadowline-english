import { expect, test } from '@playwright/test'
import { ADMIN_URL, API_URL } from './environment'
import { practiseFirstClip } from './library'
import { asAdmin, startFresh } from './session'

/**
 * Who can reach the studio, now that it is a separate app.
 *
 * It used to be a route inside this one behind a switch on the Profile screen
 * that anyone could flip. It is a console at /admin/ on this origin, and the rule
 * is ADMIN_EMAILS on the server — so these check three separate things: that the
 * app offers a learner no way in, that the console itself turns one away, and
 * that the endpoints refuse one who goes straight to them.
 */

test('learners cannot add clips of their own', async ({ page }) => {
  await startFresh(page)
  await page.goto('/library')

  await expect(page.getByPlaceholder(/Paste a YouTube/)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Clip studio' })).toHaveCount(0)

  await practiseFirstClip(page)
  await expect(page.getByRole('button', { name: /source audio/ })).toHaveCount(0)
})

test('the app offers a learner no way into the console, and an admin one', async ({ page }) => {
  await startFresh(page)

  await page.goto('/profile')
  await expect(page.getByText('Clip studio')).toHaveCount(0)

  await asAdmin(page)
  // A link and not a route: the console is another build served at this origin,
  // so the plank leaves the app.
  const plank = page.getByRole('link', { name: 'Clip studio' })
  await expect(plank).toHaveAttribute('href', '/admin/')
})

test('the console turns away an account that is not an admin', async ({ page }) => {
  await startFresh(page)

  await page.goto(`${ADMIN_URL}/admin/`)
  await expect(page.getByText('Not for this account')).toBeVisible({ timeout: 20_000 })
  // And nothing of the console behind it.
  await expect(page.getByRole('link', { name: 'Clips' })).toHaveCount(0)
})

// Hiding the console is a convenience; the rule is on the server. A learner who
// calls the endpoint directly must be refused.
test('the admin endpoints refuse a learner even when the console is reached', async ({ page }) => {
  await startFresh(page)

  const response = await page.request.post(`${API_URL}/api/admin/clips`, {
    data: { clips: [{ title: 'Sneaked in', durationSeconds: 2 }] },
  })
  expect(response.status()).toBe(403)

  await page.goto('/library')
  await expect(page.getByText('Sneaked in')).toHaveCount(0)
})
