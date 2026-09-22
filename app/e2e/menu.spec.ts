import { expect, test } from '@playwright/test'
import { asAdmin, asLearner, startFresh } from './session'

/**
 * The adventure menu: a plank per place you can go, and one of them lit.
 *
 * The chrome around it — the tree, the ropes, the fireflies — is decoration and
 * is not tested. What is tested is what a learner can act on: which plank says
 * where they are, that collapsing keeps every place reachable, and that the
 * collapsed rail still names the one they are on.
 */
test.beforeEach(async ({ page }) => {
  await startFresh(page)
  await asLearner(page)
})

test('a plank per place, and the one you are on is lit', async ({ page }) => {
  await page.goto('/library')

  const planks = page.locator('.menu-plank')
  await expect(planks).toHaveCount(5)
  await expect(planks.filter({ hasText: 'Library' })).toHaveAttribute('aria-current', 'page')
  await expect(planks.filter({ hasText: 'Library' }).getByText('HERE')).toBeVisible()

  // Only one of them.
  await expect(page.locator('.menu-plank[aria-current="page"]')).toHaveCount(1)

  await page.goto('/progress')
  await expect(planks.filter({ hasText: 'Progress' })).toHaveAttribute('aria-current', 'page')
})

test('an admin gets a sixth plank', async ({ page }) => {
  await asAdmin(page)
  await page.goto('/library')
  await expect(page.locator('.menu-plank')).toHaveCount(6)
  await expect(page.locator('.menu-plank').filter({ hasText: 'Clip studio' })).toBeVisible()
})

test('collapsing keeps every place reachable', async ({ page }) => {
  await page.goto('/library')
  await page.getByTitle('Collapse the menu').click()

  // The labels stay in the document — a screen reader should still hear them,
  // and they are what the rail shows when you point at a plank — but none of
  // them is on screen unasked.
  const vocabulary = page.locator('.menu-plank').filter({ hasText: 'Vocabulary' })
  await expect(vocabulary).toBeVisible()
  await expect(vocabulary.locator('.menu-plank-label')).toHaveCSS('opacity', '0')
  await vocabulary.hover()
  await expect(vocabulary.locator('.menu-plank-label')).toHaveCSS('opacity', '1')

  // The one you are on names itself without being pointed at.
  await expect(page.locator('.menu-plank[aria-current="page"] .menu-plank-label')).toHaveCSS(
    'opacity',
    '1',
  )

  await vocabulary.click()
  await page.waitForURL('**/vocabulary')
  await expect(page.getByRole('heading', { name: 'Vocabulary' })).toBeVisible()

  await page.getByTitle('Expand the menu').click()
  await expect(page.locator('.menu-plank').filter({ hasText: 'Progress' })).toHaveCSS(
    'opacity',
    '1',
  )
  await expect(
    page.locator('.menu-plank').filter({ hasText: 'Progress' }).locator('.menu-plank-label'),
  ).toBeInViewport()
})

test('the phone gets the same menu lying down', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await page.goto('/library')

  await expect(page.locator('.sidebar')).toBeHidden()
  const tabs = page.locator('.tabbar-link')
  await expect(tabs).toHaveCount(5)
  await expect(tabs.filter({ hasText: 'Library' })).toHaveAttribute('aria-current', 'page')
})
