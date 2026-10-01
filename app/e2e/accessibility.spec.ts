import { expect, test } from '@playwright/test'
import { asLearner, startFresh } from './session'
import { publishLesson } from './seed'
import { collectSomeWords } from './vocabulary'

/**
 * What a keyboard or a screen reader needs that the screens do not show.
 *
 * Each screen has one top-level heading (practice, analysis, dub and memory
 * practice used to start at h2 or h3), the sign-in page is a main landmark,
 * and a skip link saves tabbing through the menu on every screen.
 */
test.beforeEach(async ({ page }) => {
  await startFresh(page)
})

test('every screen has one top-level heading', async ({ page }) => {
  await publishLesson(page)
  await asLearner(page)
  await collectSomeWords(page, 1)
  const practice = new URL(page.url()).pathname
  const clip = practice.replace(/\/practice$/, '')

  for (const path of ['/dashboard', '/library', practice, clip, `${clip}/dub`, '/vocabulary', '/vocabulary/practice', '/progress', '/guide', '/profile']) {
    await page.goto(path)
    await expect(page.locator('main h1'), path).toHaveCount(1)
  }
})

test('the sign-in page is a main landmark with its heading', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/login')
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible()
})

test('the first Tab offers to skip the menu, and Enter lands on the screen', async ({ page }) => {
  await page.goto('/library')
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()

  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()

  await page.keyboard.press('Enter')
  await expect(page.locator('main#content')).toBeFocused()
  await expect(page).toHaveURL(/\/library$/)
  // The next stop is the screen's own, not the menu's.
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Search the library')).toBeFocused()
})
