import { expect, test } from '@playwright/test'
import { API_URL } from './environment'
import { asLearner, signIn, startFresh } from './session'

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
  await create.getByRole('radio', { name: 'Female' }).check()
  await create.getByRole('button', { name: 'Start as a beggar' }).click()

  const arena = page.getByTestId('arena')
  await expect(arena.getByRole('heading', { name: 'Minh' })).toBeVisible()
  await expect(arena.getByText('Level 1', { exact: true })).toBeVisible()
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

async function beggar(page: import('@playwright/test').Page, name = 'Minh') {
  await asLearner(page)
  await page.goto('/arena')
  await page.getByLabel('Fighter name').fill(name)
  await page.getByRole('button', { name: 'Start as a beggar' }).click()
  await expect(page.getByTestId('arena')).toBeVisible()
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Answers the question on screen, rightly or not, once it is the server's. */
async function answer(page: import('@playwright/test').Page, right: boolean): Promise<boolean> {
  const res = await page.request.get(`${API_URL}/api/arena/duel`)
  const { duel } = (await res.json()) as { duel: { turn: number } | null }
  if (!duel) return false
  await expect(page.getByText(`Round ${duel.turn}`, { exact: true })).toBeVisible()
  const options = page.locator('.duel-option')
  await expect(options.first()).toBeEnabled()
  const key = (await (await page.request.get(`${API_URL}/api/test/arena/duel/answer`)).json()) as { answer: string }
  const match = options.filter({ hasText: new RegExp(`^\\d${escape(key.answer)}$`) })
  if (right) await match.click()
  else await options.filter({ hasNotText: new RegExp(`^\\d${escape(key.answer)}$`) }).first().click()
  return true
}

// The tower's first floor, beaten with right answers: coins, experience, the
// next floor open; and a duel survives a reload on the way.
test('a beggar climbs the first floor of the tower', async ({ page }) => {
  await beggar(page)
  const floor1 = page.getByRole('listitem', { name: 'Floor 1: Pickpocket' })
  await expect(page.getByTestId('energy')).toHaveText('Energy 5/5')
  await expect(page.getByRole('listitem', { name: 'Floor 2: Dockhand' })).toContainText('Beat the floor below first')
  await floor1.getByRole('button', { name: 'Fight' }).click()
  await page.waitForURL('**/arena/duel')
  const duel = page.getByTestId('duel')
  await expect(duel.getByRole('meter', { name: 'Pickpocket' })).toBeVisible()

  await answer(page, true)
  await page.reload()
  await expect(page.getByTestId('duel').getByText('Round 2', { exact: true })).toBeVisible()

  for (let i = 0; i < 30; i++) {
    if (await page.getByRole('heading', { name: 'You win!' }).isVisible()) break
    if (!(await answer(page, true))) break
  }
  const outcome = page.getByRole('region', { name: 'You win!' })
  await expect(outcome).toBeVisible()
  await expect(outcome).toContainText('+32 coins')
  await expect(outcome).toContainText('First win on this floor')
  await expect(outcome).toContainText('+20 XP')

  await outcome.getByRole('link', { name: 'Back to the Arena' }).click()
  await expect(page.getByRole('listitem', { name: 'Floor 1: Pickpocket' })).toContainText('Beaten')
  await expect(page.getByRole('listitem', { name: 'Floor 2: Dockhand' }).getByRole('button', { name: 'Fight' })).toBeVisible()
  await expect(page.getByTestId('energy')).toHaveText('Energy 4/5')
})

test('wrong answers end in a knock-out, and no energy means no duel', async ({ page }) => {
  await beggar(page, 'An')
  await page.getByRole('listitem', { name: 'Floor 1: Pickpocket' }).getByRole('button', { name: 'Fight' }).click()
  await page.waitForURL('**/arena/duel')
  for (let i = 0; i < 30; i++) {
    if (await page.getByRole('heading', { name: 'Knocked out' }).isVisible()) break
    if (!(await answer(page, false))) break
  }
  await expect(page.getByRole('region', { name: 'Knocked out' })).toContainText('Nothing is lost but the energy')

  await page.request.post(`${API_URL}/api/test/arena/energy`, { data: { energy: 0 } })
  await page.goto('/arena')
  await expect(page.getByTestId('energy')).toHaveText('Energy 0/5')
  await expect(page.getByText('No energy left — practise to earn more.')).toBeVisible()
  await expect(page.getByRole('listitem', { name: 'Floor 1: Pickpocket' }).getByRole('button', { name: 'Fight' })).toBeDisabled()
})

// Another learner's fighter as a shadow: offered as a rival, fought and beaten,
// the rating up, and a win on this week's Arena board; the sound switch kept.
test('a learner beats another learner’s shadow and climbs the Arena board', async ({ page, browser }) => {
  const other = await browser.newContext()
  const rivalPage = await other.newPage()
  await signIn(rivalPage, 'rival@example.com')
  const made = await rivalPage.request.post(`${API_URL}/api/arena/fighter`, {
    data: { name: 'Lan', body: 'b', skin: 2, hair: 1 },
  })
  expect(made.ok()).toBeTruthy()
  await other.close()

  await beggar(page)
  await expect(page.getByTestId('rating')).toHaveText('Rating 1000')
  const lan = page.getByRole('listitem', { name: 'Lan' })
  await expect(lan).toContainText('Level 1')
  await expect(page.getByText('Sparring').first()).toBeVisible()
  await expect(page.getByText('Nobody has won a duel this week yet — be the first.')).toBeVisible()

  await lan.getByRole('button', { name: 'Fight' }).click()
  await page.waitForURL('**/arena/duel')
  await expect(page.getByRole('meter', { name: 'Lan’s shadow' })).toBeVisible()

  const sound = page.getByRole('button', { name: 'Sound on' })
  await sound.click()
  await expect(page.getByRole('button', { name: 'Sound off' })).toHaveAttribute('aria-pressed', 'false')

  for (let i = 0; i < 30; i++) {
    if (await page.getByRole('heading', { name: 'You win!' }).isVisible()) break
    if (!(await answer(page, true))) break
  }
  const outcome = page.getByRole('region', { name: 'You win!' })
  await expect(outcome).toContainText('Rating +16')
  await expect(outcome).toContainText('+15 coins')
  // Kept for the next duel: the switch is remembered by this browser.
  expect(await page.evaluate(() => localStorage.getItem('shadowline.arena.sound'))).toBe('off')

  await page.goto('/arena')
  await expect(page.getByTestId('rating')).toHaveText('Rating 1016')
  const board = page.getByRole('region', { name: 'This week in the Arena' })
  await expect(board.getByRole('listitem')).toHaveCount(1)
  await expect(board).toContainText('1 win')
  await expect(board).toContainText('3 points')
  // Fought today: Lan is not offered again until tomorrow.
  await expect(page.getByRole('listitem', { name: 'Lan' })).toHaveCount(0)
})
