import { expect, test } from '@playwright/test'
import { API_URL } from './environment'
import { asLearner, signIn, startFresh } from './session'

test.beforeEach(async ({ page }) => {
  await startFresh(page)
})

// A fighter starts as one of the free characters; practice pays coins; coins
// unlock another character, who is played from then on, also after a reload.
test('a street kid practises, unlocks the fisherman, and plays him', async ({ page }) => {
  await asLearner(page)
  await page.goto('/arena')
  const create = page.getByTestId('arena-create')
  await expect(create.getByRole('heading', { name: 'Create your fighter' })).toBeVisible()
  await expect(create.getByText(/two free characters/)).toBeVisible()
  await create.getByLabel('Fighter name').fill('Minh')
  await create.getByRole('radio', { name: 'Street Kid' }).check()
  await expect(create.getByText('Skill: Steady Aim')).toBeVisible()
  await create.getByRole('button', { name: 'Enter the Arena' }).click()

  const arena = page.getByTestId('arena')
  await expect(arena.getByRole('heading', { name: 'Minh' })).toBeVisible()
  await expect(arena.getByText('Level 1', { exact: true })).toBeVisible()
  await expect(arena.getByRole('img', { name: 'Minh' })).toHaveAttribute('data-character', 'street_kid')
  await expect(arena.getByTestId('coins')).toHaveText('0 coins')
  await expect(arena.getByText('2 of 24 unlocked')).toBeVisible()

  // Too poor for anything yet: each character says how far off.
  const fisherman = arena.getByRole('article', { name: 'Fisherman' })
  await expect(fisherman.getByRole('button', { name: /Unlock · 150/ })).toBeDisabled()
  await expect(fisherman).toContainText('150 more coins')
  await expect(fisherman).toContainText('Skill: Wave Slam')

  // Practice pays; from a known purse, then.
  const logged = await page.request.post(`${API_URL}/api/test/activity`, { data: { kind: 'take', times: 30 } })
  expect(logged.ok()).toBeTruthy()
  await page.reload()
  await expect(page.getByTestId('coins')).not.toHaveText('0 coins')
  await page.request.post(`${API_URL}/api/test/coins`, { data: { coins: 200 } })
  await page.reload()
  await expect(page.getByTestId('coins')).toHaveText('200 coins')
  const fishermanAgain = page.getByRole('article', { name: 'Fisherman' })
  await fishermanAgain.getByRole('button', { name: /Unlock · 150/ }).click()
  // The moment it is theirs: a celebration, to play it at once or later.
  const unlocked = page.getByRole('dialog', { name: 'Fisherman unlocked!' })
  await expect(unlocked).toBeVisible()
  await unlocked.getByRole('button', { name: 'Later' }).click()
  await expect(unlocked).toHaveCount(0)
  await expect(page.getByTestId('arena').getByRole('status')).toHaveText('Fisherman unlocked.')
  await expect(page.getByTestId('coins')).toHaveText('50 coins')
  await fishermanAgain.getByRole('button', { name: 'Play' }).click()
  await expect(fishermanAgain).toContainText('Playing')
  await expect(page.getByRole('img', { name: 'Minh' })).toHaveAttribute('data-character', 'fisherman')

  await page.reload()
  await expect(page.getByRole('img', { name: 'Minh' })).toHaveAttribute('data-character', 'fisherman')
  await expect(page.getByText('3 of 24 unlocked')).toBeVisible()
})

test('a rich fighter unlocks a legend, who hits harder, and the name can change', async ({ page }) => {
  await asLearner(page)
  await page.goto('/arena')
  await page.getByLabel('Fighter name').fill('An')
  await page.getByRole('button', { name: 'Enter the Arena' }).click()
  await expect(page.getByTestId('arena')).toBeVisible()
  const set = await page.request.post(`${API_URL}/api/test/coins`, { data: { coins: 4500 } })
  expect(set.ok()).toBeTruthy()
  await page.reload()

  await page.getByRole('tab', { name: 'Legendary' }).click()
  const monk = page.getByRole('article', { name: 'Thunder Monk' })
  await monk.getByRole('button', { name: /Unlock · 4000/ }).click()
  await expect(page.getByTestId('coins')).toHaveText('500 coins')
  await page.getByRole('dialog', { name: 'Thunder Monk unlocked!' }).getByRole('button', { name: 'Play now' }).click()
  await expect(monk).toContainText('Playing')
  // Level 1's 4 attack, and a legend's 6 more.
  await expect(page.locator('.arena-stats div', { hasText: 'Attack' }).locator('dd')).toHaveText('10')
  await expect(page.getByTestId('arena')).toContainText('Skill: Thunder Staff')

  await page.getByRole('button', { name: 'Rename' }).click()
  await page.getByLabel('Fighter name').fill('An the Brave')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByRole('heading', { name: 'An the Brave' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'An the Brave' })).toHaveAttribute('data-character', 'thunder_monk')
})

async function beggar(page: import('@playwright/test').Page, name = 'Minh') {
  await asLearner(page)
  await page.goto('/arena')
  await page.getByLabel('Fighter name').fill(name)
  await page.getByRole('button', { name: 'Enter the Arena' }).click()
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
  // The last answer may still be landing: wait for the next question, or the end.
  const ended = page.locator('.duel-outcome')
  await expect(options.first().and(page.locator(':enabled')).or(ended)).toBeVisible()
  if (await ended.isVisible()) return false
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
  const floor1 = page.getByRole('listitem', { name: 'Floor 1: Porter' })
  await expect(page.getByTestId('energy')).toHaveText('Energy 5/5')
  await expect(page.getByRole('listitem', { name: 'Floor 2: Fisherman' })).toContainText('Beat the floor below first')
  await floor1.getByRole('button', { name: 'Fight' }).click()
  await page.waitForURL('**/arena/duel')
  const duel = page.getByTestId('duel')
  await expect(duel.getByRole('meter', { name: 'Porter' })).toBeVisible()
  // Floors 1–5 are fought in the riverside market, drawn behind the fighters.
  const stage = duel.locator('.duel-stage')
  await expect(stage).toHaveAttribute('data-stage', 'market')
  await expect(stage).toHaveAttribute('data-art', '')
  expect(await stage.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('stages/market.png')

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
  await expect(page.getByRole('listitem', { name: 'Floor 1: Porter' })).toContainText('Beaten')
  await expect(page.getByRole('listitem', { name: 'Floor 2: Fisherman' }).getByRole('button', { name: 'Fight' })).toBeVisible()
  await expect(page.getByTestId('energy')).toHaveText('Energy 4/5')
})

test('wrong answers end in a knock-out, and no energy means no duel', async ({ page }) => {
  await beggar(page, 'An')
  await page.getByRole('listitem', { name: 'Floor 1: Porter' }).getByRole('button', { name: 'Fight' }).click()
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
  await expect(page.getByRole('listitem', { name: 'Floor 1: Porter' }).getByRole('button', { name: 'Fight' })).toBeDisabled()
})

// Another learner's fighter as a shadow: offered as a rival, fought and beaten,
// the rating up, and a win on this week's Arena board; the sound switch kept.
test('a learner beats another learner’s shadow and climbs the Arena board', async ({ page, browser }) => {
  const other = await browser.newContext()
  const rivalPage = await other.newPage()
  await signIn(rivalPage, 'rival@example.com')
  const made = await rivalPage.request.post(`${API_URL}/api/arena/fighter`, {
    data: { name: 'Lan', character: 'street_kid' },
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
  // Duels against other learners are fought in the ring.
  await expect(page.locator('.duel-stage')).toHaveAttribute('data-stage', 'arena')
  await expect(page.locator('.duel-stage')).toHaveAttribute('data-art', '')

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

// Four right answers fill the rage: the beggar's own skill is the button, and
// it plays as his.
test('a full rage unleashes the character’s own skill', async ({ page }) => {
  await beggar(page, 'Bao')
  await page.getByRole('listitem', { name: 'Floor 1: Porter' }).getByRole('button', { name: 'Fight' }).click()
  await page.waitForURL('**/arena/duel')
  const skill = page.getByRole('button', { name: /Desperate Fist/ })
  await expect(skill).toBeDisabled()
  for (let i = 0; i < 4; i++) await answer(page, true)
  // The rage is full, but the fifth turn is the porter's big attack, which
  // only a block answers: the skill waits for the turn after.
  await expect(page.getByText('⚠ A big attack is coming — answer right to block it!')).toBeVisible()
  await expect(skill).toBeDisabled()
  await answer(page, true)
  await expect(skill).toBeEnabled()
  await skill.click()
  await expect(page.getByText('Special ready — answer right to unleash it')).toBeVisible()
  await answer(page, true)
  await expect(page.getByRole('img', { name: 'Bao' })).toHaveAttribute('data-skill', 'crit')
  await expect(page.getByRole('status').filter({ hasText: 'Desperate Fist!' })).toBeVisible()
})

// A character up close before buying: their moves, what they would change,
// and how far off they are.
test('a character can be previewed, with what it would change', async ({ page }) => {
  await beggar(page, 'Chi')
  const fisherman = page.getByRole('article', { name: 'Fisherman' })
  await expect(fisherman).toContainText('days of practice')
  await fisherman.getByRole('button', { name: 'See', exact: true }).click()
  const preview = page.getByRole('dialog', { name: 'Fisherman' })
  await expect(preview).toBeVisible()
  await expect(preview.getByRole('group', { name: 'Moves' }).getByRole('button')).toHaveCount(5)
  await preview.getByRole('button', { name: 'Skill' }).click()
  await expect(preview.getByRole('img', { name: 'Fisherman' })).toHaveAttribute('data-animation', 'special')
  await expect(preview).toContainText('Attack')
  await expect(preview.getByRole('button', { name: /Unlock · 150/ })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(preview).toHaveCount(0)
})

// Right, but late: the blow is weaker, and the opponent hits back.
test('a late right answer is hit back', async ({ page }) => {
  await beggar(page, 'Dung')
  await page.getByRole('listitem', { name: 'Floor 1: Porter' }).getByRole('button', { name: 'Fight' }).click()
  await page.waitForURL('**/arena/duel')
  await expect(page.locator('.duel-option').first()).toBeEnabled()
  const res = await page.request.get(`${API_URL}/api/arena/duel`)
  const { duel } = (await res.json()) as { duel: { seconds: number } }
  await page.waitForTimeout(duel.seconds * 800)
  await answer(page, true)
  const verdict = page.getByRole('status').filter({ hasText: /Slow ×/ })
  await expect(verdict).toBeVisible()
  await expect(verdict).toContainText('Hit back −')
})
