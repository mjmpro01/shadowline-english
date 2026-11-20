import { expect, test } from '@playwright/test'
import { API_URL } from './environment'
import { asLearner, startFresh } from './session'

test.beforeEach(async ({ page }) => {
  await startFresh(page)
})

// A fighter starts as a beggar; practice pays coins; coins buy gear; gear is
// worn and shows on the fighter, and stays on after a reload.
test('a beggar practises, buys a hat, and wears it', async ({ page }) => {
  await asLearner(page)
  await page.goto('/arena')
  const create = page.getByTestId('arena-create')
  await expect(create.getByRole('heading', { name: 'Create your fighter' })).toBeVisible()
  await expect(create.getByText(/You start as a beggar/)).toBeVisible()
  await create.getByLabel('Fighter name').fill('Minh')
  await create.getByRole('radio', { name: 'Build B' }).check()
  await create.getByRole('button', { name: 'Start as a beggar' }).click()

  const arena = page.getByTestId('arena')
  await expect(arena.getByRole('heading', { name: 'Minh' })).toBeVisible()
  await expect(arena.getByText('Level 1')).toBeVisible()
  const fighter = arena.getByRole('img', { name: 'Minh' })
  await expect(fighter.locator('[data-item="rags"]')).toHaveCount(1)
  await expect(arena.getByTestId('coins')).toHaveText('0 coins')

  // Too poor for anything yet: the shop says how far off.
  await arena.getByRole('tab', { name: 'Shop' }).click()
  const hat = arena.getByRole('article', { name: 'Straw hat' })
  await expect(hat.getByRole('button', { name: /Buy · 60/ })).toBeDisabled()
  await expect(hat).toContainText('60 more coins')

  // Thirty takes' worth of practice: 60 coins, and more for the day's goal.
  const logged = await page.request.post(`${API_URL}/api/test/activity`, { data: { kind: 'take', times: 30 } })
  expect(logged.ok()).toBeTruthy()
  await page.reload()
  await expect(page.getByTestId('coins')).not.toHaveText('0 coins')
  // Achievements unlocked by that pay too; from a known purse, then.
  await page.request.post(`${API_URL}/api/test/coins`, { data: { coins: 80 } })
  await page.reload()
  await expect(page.getByTestId('coins')).toHaveText('80 coins')
  await page.getByRole('tab', { name: 'Shop' }).click()
  const hatAgain = page.getByRole('article', { name: 'Straw hat' })
  await hatAgain.getByRole('button', { name: /Buy · 60/ }).click()
  await expect(page.getByTestId('arena').getByRole('status')).toHaveText('Straw hat is yours.')
  await expect(hatAgain.getByText('Owned')).toBeVisible()
  await expect(page.getByTestId('coins')).toHaveText('20 coins')

  await page.getByRole('tab', { name: 'Bag' }).click()
  await page.getByRole('article', { name: 'Straw hat' }).getByRole('button', { name: 'Wear' }).click()
  await expect(page.getByRole('img', { name: 'Minh' }).locator('[data-item="straw_hat"]')).toHaveCount(1)
  await expect(page.getByRole('article', { name: 'Straw hat' }).getByRole('button', { name: 'Take off' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('img', { name: 'Minh' }).locator('[data-item="straw_hat"]')).toHaveCount(1)
  await page.getByRole('tab', { name: 'Fighter' }).click()
  await expect(page.getByTestId('arena')).toContainText('Straw hat')
})

test('a rich fighter buys a blade and the look can change', async ({ page }) => {
  await asLearner(page)
  await page.goto('/arena')
  await page.getByLabel('Fighter name').fill('An')
  await page.getByRole('button', { name: 'Start as a beggar' }).click()
  await expect(page.getByTestId('arena')).toBeVisible()
  const set = await page.request.post(`${API_URL}/api/test/coins`, { data: { coins: 2000 } })
  expect(set.ok()).toBeTruthy()
  await page.reload()

  await page.getByRole('tab', { name: 'Shop' }).click()
  await page.getByRole('article', { name: 'Twin blades' }).getByRole('button', { name: /Buy · 1500/ }).click()
  await expect(page.getByTestId('coins')).toHaveText('500 coins')
  await page.getByRole('tab', { name: 'Bag' }).click()
  await page.getByRole('article', { name: 'Twin blades' }).getByRole('button', { name: 'Wear' }).click()
  // A beggar's 4 attack, and the blades' 7.
  await expect(page.locator('.arena-stats div', { hasText: 'Attack' }).locator('dd')).toHaveText('11')

  await page.getByRole('button', { name: 'Change look' }).click()
  await page.getByLabel('Fighter name').fill('An the Brave')
  await page.getByRole('button', { name: 'Save look' }).click()
  await expect(page.getByRole('heading', { name: 'An the Brave' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'An the Brave' }).locator('[data-item="twin_blades"]')).toHaveCount(1)
})
