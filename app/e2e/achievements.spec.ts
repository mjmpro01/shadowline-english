import { expect, test } from '@playwright/test'
import { API_URL } from './environment'
import { asLearner, startFresh } from './session'
import { publishLesson } from './seed'

test.beforeEach(async ({ page }) => {
  await startFresh(page)
})

async function recordATake(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/library')
  await page.getByLabel('Search the library').fill('Shadow this line 1')
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await page.waitForTimeout(2600)
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeVisible({ timeout: 20_000 })
}

// The first take is the first milestone: celebrated once, wherever the learner
// is, then kept on the Profile and the achievements page.
test('a first take unlocks an achievement, celebrated once', async ({ page }) => {
  await publishLesson(page)
  await asLearner(page)
  await page.goto('/profile')
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Achievements' }) })
  await expect(card).toContainText('0 of')
  await expect(card).toContainText('Your first take unlocks the first one.')

  await recordATake(page)
  const toast = page.locator('.ach-toast')
  await expect(toast).toContainText('New achievement')
  await expect(toast).toContainText('First take')
  await toast.getByRole('button', { name: 'Close' }).click()

  // One, or two: on the generous scale the same take can also be the first
  // to score 90 or more, which is a milestone of its own. It unlocks once the
  // score lands: if that was before the first was closed, it is celebrated
  // straight after it; otherwise on the next screen. Either way, once.
  let second = false
  const next = toast.filter({ hasText: 'scoring 90+' })
  if (await next.waitFor({ timeout: 1500 }).then(() => true, () => false)) {
    await toast.getByRole('button', { name: 'Close' }).click()
    second = true
  }
  await expect(toast).toHaveCount(0)
  await page.reload()
  await page.goto('/profile')
  await expect(card).toContainText(/[12] of/)
  await expect(card).toContainText('First take')
  if (!second && /2 of/.test((await card.textContent()) ?? '')) {
    await expect(toast).toContainText('scoring 90+')
    await toast.getByRole('button', { name: 'Close' }).click()
    await expect(toast).toHaveCount(0)
  }

  // Seen: not again, after a reload or on another screen.
  await page.reload()
  await page.goto('/profile')
  await expect(card).toContainText('First take')
  await expect(page.locator('.ach-toast')).toHaveCount(0)

  await card.getByRole('link', { name: 'See all' }).click()
  await page.waitForURL('**/achievements')
  await expect(page.getByRole('heading', { name: 'Achievements', level: 1 })).toBeVisible()
  const takes = page.locator('.ach-track', { has: page.getByRole('heading', { name: 'Recordings' }) })
  await expect(takes.locator('.ach-track-count')).toHaveText('1 / 50')
  await expect(takes).toContainText('49 more to the next')
  await expect(takes.locator('li[data-unlocked]')).toHaveCount(1)
})

// Learning done elsewhere moves its own track, and a streak's first rung is
// celebrated on the next screen the learner opens.
test('the achievements page shows every track’s progress', async ({ page }) => {
  await asLearner(page)
  await page.goto('/achievements')
  const goal = page.locator('.ach-track', { has: page.getByRole('heading', { name: 'Daily goal' }) })
  await expect(goal.locator('.ach-track-count')).toHaveText('0 / 1')

  const logged = await page.request.post(`${API_URL}/api/test/activity`, { data: { kind: 'dictation', times: 4 } })
  expect(logged.ok()).toBeTruthy()
  await page.goto('/dashboard')
  await expect(page.locator('.ach-toast')).toContainText('Daily goal reached on 1 day')
  await page.goto('/achievements')
  await expect(goal.locator('.ach-track-count')).toHaveText('1 / 7')
  await expect(goal.locator('li[data-unlocked]')).toHaveCount(1)
})
