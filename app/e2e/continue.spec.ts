import { expect, test } from '@playwright/test'
import { asLearner, startFresh } from './session'
import { publishLesson } from './seed'

test.beforeEach(async ({ page }) => {
  await startFresh(page)
})

async function practiseFirstLine(page: import('@playwright/test').Page, line = 1): Promise<void> {
  await page.goto('/library')
  await page.getByLabel('Search the library').fill(`Shadow this line ${line}`)
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')
  await recordATake(page)
}

async function recordATake(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await page.waitForTimeout(2600)
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByRole('button', { name: 'Re-record', exact: true })).toBeVisible({ timeout: 20_000 })
}

// Clips are one line each: once a take is in, "Next line" goes on to the next
// clip of the episode, fresh, and after the last one back to the episode.
test('next line goes on to the next clip, and the last one back to the episode', async ({ page }) => {
  await publishLesson(page)
  await asLearner(page)
  await page.goto('/library')
  await page.getByLabel('Search the library').fill('Shadow this line 1')
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')
  const next = page.getByRole('button', { name: 'Next line', exact: true })
  await expect(next).toBeDisabled()
  await recordATake(page)
  await expect(next).toBeEnabled()

  const first = page.url()
  await next.click()
  await expect(page).not.toHaveURL(first)
  await expect(page).toHaveURL(/\/practice$/)
  await expect(page.locator('[data-tour="caption"]')).toContainText(/Shadow\s*this\s*line\s*2/)
  // A fresh start on the new clip: no take, so nothing to go on to yet.
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeVisible()
  await expect(next).toBeDisabled()

  await practiseFirstLine(page, 4)
  await page.getByRole('button', { name: 'Back to the episode', exact: true }).click()
  await page.waitForURL('**/library/e/**')
})

// One line into an episode, the dashboard offers the next one.
test('the dashboard picks up where the learner left off', async ({ page }) => {
  await publishLesson(page)
  await asLearner(page)
  await practiseFirstLine(page)

  await page.goto('/dashboard')
  const card = page.locator('.continue-card')
  await expect(card).toContainText('Pick up where you left off')
  await expect(card).toContainText('Lesson one')
  await expect(card.getByRole('progressbar', { name: '1 of 4 lines practised' })).toBeVisible()
  await card.getByRole('button', { name: 'Practise the next line' }).click()
  await expect(page).toHaveURL(/\/practice$/)
  await expect(page.locator('[data-tour="caption"]')).toContainText(/Shadow\s*this\s*line\s*2/)

  // Practising in a series follows it.
  await page.goto('/library/s/lesson-one')
  await expect(page.getByRole('button', { name: 'Following ✓' })).toHaveAttribute('aria-pressed', 'true')
})

// A new episode is tagged until it is opened, on the dashboard and in its series.
test('a new episode is new until it is opened', async ({ page }) => {
  await publishLesson(page)
  await asLearner(page)

  const row = page.locator('section', { has: page.getByRole('heading', { name: /New episodes|New since/ }) })
  await expect(row.getByRole('button', { name: 'Open lesson.wav' })).toBeVisible()

  await page.goto('/library/s/lesson-one')
  const episode = page.getByRole('button', { name: 'Open lesson.wav' })
  await expect(episode.locator('.new-tag')).toHaveText('New')

  // Followed by hand, and kept.
  await page.getByRole('button', { name: 'Follow', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Following ✓' })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Following ✓' })).toBeVisible()

  await page.getByRole('button', { name: 'Open lesson.wav' }).click()
  await page.waitForURL('**/library/e/**')
  await page.goto('/library/s/lesson-one')
  await expect(page.getByRole('button', { name: 'Open lesson.wav' }).locator('.new-tag')).toHaveCount(0)
  await page.goto('/dashboard')
  await expect(page.getByRole('button', { name: 'Open lesson.wav' })).toHaveCount(0)

  // And unfollowed.
  await page.goto('/library/s/lesson-one')
  await page.getByRole('button', { name: 'Following ✓' }).click()
  await expect(page.getByRole('button', { name: 'Follow', exact: true })).toHaveAttribute('aria-pressed', 'false')
})
