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

/* — Chapter 2: the woods and their fights — */

/** The first story step of chapter 2, where the woods open. */
const WOODS_STEP = 10
/** Just west of the first Word-slime's spot (server: slime_1 at tile 9,7). */
const BY_THE_SLIME = { map: 'woods', x: 136, y: 128 }

async function openWoods(page: Page) {
  expect((await page.request.post(`${API_URL}/api/test/game/step`, { data: { step: WOODS_STEP } })).status()).toBe(204)
  expect((await page.request.post(`${API_URL}/api/game/move`, { data: BY_THE_SLIME })).status()).toBe(204)
  await openFarm(page)
}

/** Answers the question in play, rightly or not, the way a player would. */
async function answer(page: Page, right: boolean) {
  const fight = page.locator('.arena-battle')
  const key = ((await (await page.request.get(`${API_URL}/api/test/game/battle/answer`)).json()) as { answer: string })
    .answer
  const question = fight.locator('.arena-question')
  if ((await question.getAttribute('data-kind')) === 'scramble') {
    // Typed on the keyboard, where a full spelling is checked by itself;
    // Enter on nothing spelled is a wrong answer.
    if (right) for (const letter of key) await page.keyboard.press(letter)
    else await page.keyboard.press('Enter')
  } else {
    const options = await fight.locator('.arena-option span').allInnerTexts()
    const i = options.findIndex((o) => (o.trim() === key) === right)
    await page.keyboard.press(String(i + 1))
  }
  await expect(fight.locator('.arena-turn')).toBeVisible()
  await expect(fight.locator('.arena-turn')).toHaveAttribute('data-right', String(right))
  await page.keyboard.press('Enter')
}

test('the woods open with chapter 2, and a fight is won with words', async ({ page }) => {
  await openWoods(page)
  const gold = Number(await page.getByTestId('arena-gold').innerText())

  // A step east faces the slime.
  await page.locator('.arena canvas').click({ position: { x: 20, y: 300 } })
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(60)
  await page.keyboard.up('ArrowRight')
  await expect(page.locator('.arena-action')).toContainText('Fight')
  await page.keyboard.press('e')

  const fight = page.getByRole('dialog', { name: 'A wild Word-slime!' })
  await expect(fight).toBeVisible()
  await expect(page.getByTestId('arena-stamina')).toContainText('27/30')

  // Three hits beat a slime (fewer, when one is quick enough to be critical).
  for (let i = 0; i < 3 && !(await fight.locator('.arena-outcome').isVisible()); i++) await answer(page, true)
  await expect(fight.locator('.arena-outcome')).toContainText('You won!')
  // 8 gold, and 4 more for a fight with no hit taken.
  await expect(page.getByTestId('arena-gold')).toHaveText(String(gold + 12))
  await expect(fight.locator('.arena-word-list')).not.toBeEmpty()
  await fight.getByRole('button', { name: 'Back to the woods' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // The slime is gone until it comes back.
  await expect(page.locator('.arena-action')).toHaveCount(0)
  const again = await page.request.post(`${API_URL}/api/game/battle/start`, { data: { spawn: 'slime_1' } })
  expect(again.status()).toBe(409)
})

test('a fight left half-way goes on after a reload, and fainting sends the farmer home', async ({ page }) => {
  await openWoods(page)
  const started = await page.request.post(`${API_URL}/api/game/battle/start`, { data: { spawn: 'bat_1' } })
  expect(started.ok()).toBe(true)
  const gold = Number(((await started.json()) as { state: { profile: { gold: number } } }).state.profile.gold)

  await page.reload()
  const fight = page.getByRole('dialog', { name: 'A wild Echo-bat!' })
  await expect(fight).toBeVisible()

  // An Echo-bat hits for 4: 30 health lasts eight wrong answers.
  for (let i = 0; i < 8; i++) await answer(page, false)
  await expect(fight.locator('.arena-outcome')).toContainText('You fainted')
  const fine = Math.min(50, Math.floor(gold / 10))
  await expect(page.getByTestId('arena-gold')).toHaveText(String(gold - fine))
  await expect(page.getByTestId('arena-hp')).toContainText('15/30')
  await fight.getByRole('button', { name: 'Go home' }).click()

  // Home: the house door is right above.
  await expect(page.getByTestId('arena')).toHaveAttribute('data-map', 'farm')
  await page.locator('.arena canvas').click({ position: { x: 20, y: 300 } })
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(60)
  await page.keyboard.up('ArrowUp')
  await expect(page.locator('.arena-action')).toContainText('Go inside')
})
