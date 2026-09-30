import { expect, test } from '@playwright/test'
import { startFresh } from './session'

/**
 * The guide: how to use Shadowline, for somebody who has just signed up.
 *
 * What is checked is that a new learner can find it from where they are — the
 * first-steps card, the menu, Profile, the practice screen — and that it names
 * the buttons as the screens do, since a guide that says "Record" beside a
 * button reading something else is worse than none.
 */
test.beforeEach(async ({ page }) => {
  await startFresh(page)
})

test('a new learner finds the guide on the first-steps card', async ({ page }) => {
  await page.getByRole('button', { name: 'How it works' }).click()
  await expect(page).toHaveURL(/\/guide$/)
  await expect(page.getByRole('heading', { name: 'How to use Shadowline' })).toBeVisible()

  // Every part is there, in order.
  const headings = page.locator('.guide-heading')
  await expect(headings).toHaveText([
    'Practise a line in 5 steps',
    'Once you have practised',
    'Tips for a better score',
    'Something not working?',
  ])
  await expect(page.locator('#practice .guide-step')).toHaveCount(5)

  // The buttons are named as the screens name them.
  const keys = page.locator('.guide-button')
  for (const name of ['Record', 'Stop', 'Re-record', 'See analysis', 'Next line', 'Dub review']) {
    await expect(keys.filter({ hasText: new RegExp(`^${name}$`) })).toHaveCount(1)
  }

  // The questions open to their answers.
  await page.getByText('Record does not record anything').click()
  await expect(page.getByText('Your browser may be blocking the microphone')).toBeVisible()
  await expect(page.getByText('press “Reset mic” and try again')).toBeVisible()
})

test('the menu, Profile and the contents lead to it and around it', async ({ page }) => {
  await page.goto('/library')
  await page.locator('.sidebar').getByRole('link', { name: 'Guide' }).click()
  await expect(page).toHaveURL(/\/guide$/)

  await page.getByRole('navigation', { name: 'Contents' }).getByRole('link', { name: 'Something not working?' }).click()
  await expect(page).toHaveURL(/\/guide#help$/)
  await expect(page.locator('#help')).toBeInViewport()

  await page.goto('/profile')
  await page.getByRole('link', { name: 'How to use Shadowline' }).click()
  await expect(page).toHaveURL(/\/guide$/)
})

test('it reads in Vietnamese too', async ({ page }) => {
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Tiếng Việt' }).click()
  await page.goto('/guide')
  await expect(page.getByRole('heading', { name: 'Hướng dẫn sử dụng' })).toBeVisible()
  await expect(page.locator('.guide-button').filter({ hasText: /^Ghi âm$/ })).toHaveCount(1)
})

test('the practice screen links to the steps, and lands on them', async ({ page }) => {
  // A starter clip: it needs no audio for this, only the practice screen.
  await page.goto('/library')
  await page.getByLabel('Search the library').fill('One step at a time')
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')

  await page.getByRole('link', { name: 'Not sure how this works? Read the guide' }).click()
  await expect(page).toHaveURL(/\/guide#practice$/)
  await expect(page.getByRole('heading', { name: 'Practise a line in 5 steps' })).toBeInViewport()
})
