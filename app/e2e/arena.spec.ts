import { expect, test, type Page } from '@playwright/test'
import { API_URL } from './environment'
import { startFresh } from './session'

/**
 * The Arena: plant a seed, wait for it, harvest a word.
 *
 * The farm is drawn on a canvas, so the test walks it the way a player does —
 * keys — and reads what the page around it says: the action button, the
 * panels, the tracker. Where the player stands is set through the API first,
 * so the walk is one step rather than a route across the map.
 */

/** Just above the first plot, so one step down faces it. */
const ABOVE_FIRST_PLOT = { map: 'farm', x: 224, y: 156 }

async function openFarm(page: Page) {
  await page.goto('/arena')
  await expect(page.locator('.arena canvas')).toBeVisible()
  // The farm and the letter arrive together: once the gold shows, the letter
  // is either open or not coming. A new farmer is greeted by it until its
  // reward is claimed.
  await expect(page.getByTestId('arena-gold')).toBeVisible()
  // Keys pressed before the scene is up go nowhere.
  await expect(page.getByTestId('arena')).toHaveAttribute('data-ready', 'true')
  const letter = page.getByRole('dialog', { name: 'A letter from Grandma' })
  if (await letter.isVisible().catch(() => false)) await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

/** Faces down, one short step, then acts on what is there. */
async function actBelow(page: Page) {
  await page.locator('.arena canvas').click({ position: { x: 20, y: 300 } })
  await page.keyboard.down('ArrowDown')
  await page.waitForTimeout(60)
  await page.keyboard.up('ArrowDown')
  await expect(page.locator('.arena-action')).toContainText('Plot')
  await page.keyboard.press('e')
}

test.beforeEach(async ({ page }) => {
  await startFresh(page)
  const moved = await page.request.post(`${API_URL}/api/game/move`, { data: ABOVE_FIRST_PLOT })
  expect(moved.status()).toBe(204)
})

test('a new farmer gets a letter and a few seeds', async ({ page }) => {
  await page.goto('/arena')
  const letter = page.getByRole('dialog', { name: 'A letter from Grandma' })
  await expect(letter).toContainText('Dear child')
  await expect(page.getByTestId('arena-gold')).toHaveText('50')
  await expect(page.getByTestId('arena-stamina')).toContainText('30/30')
})

test('a harvest is a new word, and it lands in Vocabulary', async ({ page }) => {
  await openFarm(page)

  await actBelow(page)
  await page.getByRole('button', { name: /Plant Sprout/ }).click()
  await expect(page.getByTestId('arena-stamina')).toContainText('28/30')
  await page.keyboard.press('Escape')
  await expect(page.locator('.arena-tracker')).toContainText('1/1')

  // Growing takes two minutes; the test server can skip them.
  expect((await page.request.post(`${API_URL}/test/game/ripen`)).ok()).toBe(true)
  await openFarm(page)
  await actBelow(page)
  await page.getByRole('button', { name: 'Harvest' }).click()

  const card = page.getByRole('dialog', { name: 'A new word grew!' })
  await expect(card).toContainText('Added to your vocabulary.')
  const word = await card.locator('.arena-word-text').innerText()
  await expect(card.locator('.arena-word-meaning')).not.toBeEmpty()

  await card.getByRole('link', { name: 'Open Vocabulary' }).click()
  await expect(page).toHaveURL(/\/vocabulary$/)
  await expect(page.getByText(word, { exact: true }).first()).toBeVisible()
})

test('a finished story step pays, and the next one begins', async ({ page }) => {
  await openFarm(page)
  await actBelow(page)
  await page.getByRole('button', { name: /Plant Sprout/ }).click()
  await page.keyboard.press('Escape')

  await page.locator('.arena-tracker').click()
  const book = page.getByRole('dialog', { name: 'Quests' })
  await book.getByRole('button', { name: 'Claim reward' }).click()
  await expect(page.getByTestId('arena-gold')).toHaveText('70')
  // The next step starts at nothing done.
  await expect(page.locator('.arena-tracker')).toContainText('0/1')
})
