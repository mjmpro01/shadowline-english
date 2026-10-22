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

/** Bram's step, where the troll is home (server: game.TrollStep). */
const TROLL_STEP = 15

test("the troll fights in three phases and gives back Bram's hammer", async ({ page }) => {
  await openWoods(page)
  // Before Bram asks, the lair is empty.
  expect((await page.request.post(`${API_URL}/api/test/game/step`, { data: { step: TROLL_STEP - 1 } })).status()).toBe(204)
  const closed = await page.request.post(`${API_URL}/api/game/battle/start`, { data: { spawn: 'troll_lair' } })
  expect(closed.status()).toBe(409)
  expect(((await closed.json()) as { code: string }).code).toBe('lair_closed')

  expect((await page.request.post(`${API_URL}/api/test/game/step`, { data: { step: TROLL_STEP } })).status()).toBe(204)
  expect((await page.request.post(`${API_URL}/api/game/battle/start`, { data: { spawn: 'troll_lair' } })).ok()).toBe(true)
  // The fight reopens on loading.
  await page.reload()
  await expect(page.getByTestId('arena')).toHaveAttribute('data-ready', 'true')
  const fight = page.getByRole('dialog', { name: 'A wild Mumble Troll!' })
  await expect(fight).toBeVisible()
  await expect(fight.getByTestId('battle-phase')).toHaveText('Phase 1 of 3')

  const seen = new Set<string>()
  for (let i = 0; i < 12 && !(await fight.locator('.arena-outcome').isVisible()); i++) {
    seen.add(await fight.getByTestId('battle-phase').innerText())
    await answer(page, true)
  }
  await expect(fight.locator('.arena-outcome')).toContainText('You won!')
  expect([...seen].sort()).toEqual(['Phase 1 of 3', 'Phase 2 of 3', 'Phase 3 of 3'])
  await fight.getByRole('button', { name: 'Back to the woods' }).click()

  // Bram's step is done: his hammer comes with the reward.
  expect((await page.request.post(`${API_URL}/api/game/quests/claim`, { data: { quest: 'main' } })).ok()).toBe(true)
  await openFarm(page)
  await page.getByRole('button', { name: 'Bag' }).click()
  await expect(page.getByRole('dialog', { name: 'Your bag' })).toContainText("Bram's hammer")
})

/* — Chapter 3: Echo Town — */

/** The first step of chapter 3, where the town opens (server: game.TownStep). */
const TOWN_STEP = 17
/** On the farm's road south, just above the gate to town. */
const ABOVE_TOWN_GATE = { map: 'farm', x: 18 * 16 + 8, y: 20 * 16 }
/** In town, just right of Mayor Elsa at the town hall's door. */
const BY_ELSA = { map: 'town', x: 7 * 16 + 4, y: 8 * 16 }

async function setStep(page: Page, step: number) {
  expect((await page.request.post(`${API_URL}/api/test/game/step`, { data: { step } })).status()).toBe(204)
}

/** Faces west, one short step, then acts on what is there. */
async function actLeft(page: Page) {
  await page.locator('.arena canvas').click({ position: { x: 20, y: 300 } })
  await page.keyboard.down('ArrowLeft')
  await page.waitForTimeout(60)
  await page.keyboard.up('ArrowLeft')
  await expect(page.locator('.arena-action')).toContainText('Talk')
  await page.keyboard.press('e')
}

test('the road south opens with chapter 3 and leads to Echo Town', async ({ page }) => {
  await setStep(page, TOWN_STEP - 1)
  expect((await page.request.post(`${API_URL}/api/game/move`, { data: ABOVE_TOWN_GATE })).status()).toBe(204)
  await openFarm(page)
  // Closed: the farmer is turned back, with a word about why.
  await page.locator('.arena canvas').click({ position: { x: 20, y: 300 } })
  await page.keyboard.down('ArrowDown')
  await page.waitForTimeout(1500)
  await page.keyboard.up('ArrowDown')
  await expect(page.locator('.arena-toast')).toContainText('road to town is closed')
  await expect(page.getByTestId('arena')).toHaveAttribute('data-map', 'farm')

  await setStep(page, TOWN_STEP)
  expect((await page.request.post(`${API_URL}/api/game/move`, { data: ABOVE_TOWN_GATE })).status()).toBe(204)
  await openFarm(page)
  await page.locator('.arena canvas').click({ position: { x: 20, y: 300 } })
  await page.keyboard.down('ArrowDown')
  await page.waitForTimeout(1500)
  await page.keyboard.up('ArrowDown')
  await expect(page.getByTestId('arena')).toHaveAttribute('data-map', 'town')
  await expect(page.locator('.arena-tracker')).toContainText('1/1')
})

test('a chat a day and a gift they love make a friend in town', async ({ page }) => {
  await setStep(page, TOWN_STEP)
  expect((await page.request.post(`${API_URL}/api/game/move`, { data: BY_ELSA })).status()).toBe(204)
  await openFarm(page)
  await actLeft(page)

  const talk = page.getByRole('dialog', { name: 'Mayor Elsa' })
  const chat = talk.locator('.arena-chat')
  await expect(chat.locator('.arena-option')).toHaveCount(3)
  // The right reply is the server's to know; the test asks it, then uses the keys.
  const { reply } = (await (await page.request.get(`${API_URL}/api/test/game/talk/answer?npc=elsa`)).json()) as {
    reply: number
  }
  await page.keyboard.press(String(reply + 1))
  await expect(chat.locator('.arena-turn')).toHaveAttribute('data-right', 'true')
  await expect(chat).toContainText('+30 with Mayor Elsa')

  // A honey cake from Hugo, which Elsa loves, given with the right words.
  expect((await page.request.post(`${API_URL}/api/game/buy`, { data: { item: 'honey_cake', qty: 1 } })).ok()).toBe(true)
  await page.keyboard.press('Escape')
  await openFarm(page)
  await actLeft(page)
  await expect(talk.locator('.arena-chat')).toContainText('You have chatted today')
  await talk.getByRole('button', { name: /Give a gift/ }).click()
  await talk.getByRole('button', { name: /Honey cake/ }).click()
  await talk.getByRole('button', { name: 'This is for you. I hope you like it!' }).click()
  await expect(talk.locator('.arena-gift')).toContainText('Mayor Elsa loves it!')
  await expect(talk.getByTestId('friend-hearts')).toHaveAttribute('aria-label', '1 hearts')

  // The quest book's townsfolk.
  await page.keyboard.press('Escape')
  await page.locator('.arena-tracker').click()
  await page.getByRole('tab', { name: 'Townsfolk' }).click()
  await expect(page.getByTestId('friend-elsa')).toContainText('Chatted today')
  await expect(page.getByTestId('friend-elsa')).toContainText('Gift given today')
})

// Chapter 3, second half: the Word Hall, the library, and letters from town.
const HALL_STEP = 21
const LIBRARY_STEP = 24
const LETTER_STEP = 25
/** In town, on the path just below the Word Hall's door. */
const BELOW_HALL = { map: 'town', x: 12 * 16 + 8, y: 7 * 16 + 12 }
/** In town, just below the library's door. */
const BELOW_LIBRARY = { map: 'town', x: 4 * 16 + 8, y: 17 * 16 + 12 }
/** On the farm, just below the mailbox. */
const BELOW_MAILBOX = { map: 'farm', x: 9 * 16 + 8, y: 6 * 16 + 12 }

/** Faces north, one short step, then acts on what is there. */
async function actUp(page: Page, label: string) {
  await page.locator('.arena canvas').click({ position: { x: 20, y: 300 } })
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(60)
  await page.keyboard.up('ArrowUp')
  await expect(page.locator('.arena-action')).toContainText(label)
  await page.keyboard.press('e')
}

async function quizAnswer(page: Page, kind: 'note' | 'donate'): Promise<string> {
  const res = await page.request.get(`${API_URL}/api/test/game/quiz/answer?kind=${kind}`)
  expect(res.ok()).toBe(true)
  return ((await res.json()) as { answer: string }).answer
}

test("the Word Hall's notes are read with Sage Orin's glasses", async ({ page }) => {
  await setStep(page, HALL_STEP)
  expect((await page.request.post(`${API_URL}/api/game/move`, { data: BELOW_HALL })).status()).toBe(204)
  await openFarm(page)
  await actUp(page, 'Read the door')
  const hall = page.getByRole('dialog', { name: 'The Word Hall' })
  await expect(hall).toContainText('strange little letters you cannot read')
  await page.keyboard.press('Escape')

  // Elsa's step is done by the visit; Sage Orin's gives the glasses.
  for (let i = 0; i < 2; i++) {
    expect((await page.request.post(`${API_URL}/api/game/quests/claim`, { data: { quest: 'main' } })).ok()).toBe(true)
  }
  await openFarm(page)
  await actUp(page, 'Read the door')
  await expect(hall.locator('.arena-option')).toHaveCount(4)
  await expect(hall.getByTestId('notes-read')).toContainText('0 of 3')
  const answer = await quizAnswer(page, 'note')
  await hall.locator('.arena-option', { hasText: new RegExp(`^\\d${answer}$`) }).click()
  await expect(hall.locator('.arena-turn')).toHaveAttribute('data-right', 'true')
  await expect(hall).toContainText(answer)
  await expect(hall.getByTestId('notes-read')).toContainText('1 of 3')
  await hall.getByRole('button', { name: 'Next note' }).click()
  await expect(hall.locator('.arena-option')).toHaveCount(4)
})

test('Lina takes a word for the library once its meaning is known', async ({ page }) => {
  await setStep(page, LIBRARY_STEP)
  for (const word of ['water', 'garden']) {
    expect((await page.request.post(`${API_URL}/api/vocab`, { data: { word } })).status()).toBe(201)
  }
  expect((await page.request.post(`${API_URL}/api/game/move`, { data: BELOW_LIBRARY })).status()).toBe(204)
  await openFarm(page)
  await actUp(page, 'Library')
  const library = page.getByRole('dialog', { name: 'Lina’s library' })
  await expect(library.getByTestId('library-donated')).toHaveText('0 words on the shelves')

  await library.getByRole('button', { name: 'water', exact: true }).click()
  await expect(library).toContainText('What does “water” mean?')
  const answer = await quizAnswer(page, 'donate')
  await library.locator('.arena-option', { hasText: answer }).click()
  await expect(library.locator('.arena-turn')).toHaveAttribute('data-right', 'true')
  await expect(library).toContainText('“water” is on the shelf now')
  await library.getByRole('button', { name: 'Give another word' }).click()
  await expect(library.getByTestId('library-donated')).toHaveText('1 word on the shelves')
  await expect(library.getByRole('button', { name: 'water', exact: true })).toHaveCount(0)
  await expect(library.getByRole('button', { name: 'garden', exact: true })).toBeVisible()
})

test("the day's letter is read at the mailbox and brought to its writer", async ({ page }) => {
  await setStep(page, LETTER_STEP)
  expect((await page.request.post(`${API_URL}/api/test/game/gold`, { data: { gold: 500 } })).status()).toBe(204)
  expect((await page.request.post(`${API_URL}/api/game/move`, { data: BELOW_MAILBOX })).status()).toBe(204)
  await openFarm(page)
  await actUp(page, 'Open')
  const key = (await (await page.request.get(`${API_URL}/api/test/game/letter`)).json()) as {
    npc: string
    item: string
    qty: number
  }
  const letter = page.locator('.arena-letter')
  await expect(letter).toBeVisible()
  await expect(letter).toContainText('Take what is asked for to')
  await page.keyboard.press('Escape')

  // What the letter asks for, from the shop, then to the writer's door.
  expect((await page.request.post(`${API_URL}/api/game/buy`, { data: { item: key.item, qty: key.qty } })).ok()).toBe(true)
  const writer = (await (await page.request.get(`${API_URL}/api/game/state`)).json()) as {
    friends: { id: string; name: { en: string } }[]
  }
  const name = writer.friends.find((f) => f.id === key.npc)!.name.en
  const door = { elsa: [5, 7], vy: [21, 7], orin: [28, 7], lina: [5, 17], hugo: [28, 17] }[key.npc]!
  const beside = { map: 'town', x: (door[0] + 2) * 16 + 4, y: (door[1] + 1) * 16 }
  expect((await page.request.post(`${API_URL}/api/game/move`, { data: beside })).status()).toBe(204)
  await openFarm(page)
  await actLeft(page)
  // The writer's dialog is titled by their story step when they have one
  // (Elsa gives the letters step), so the button is found on its own.
  const give = page.getByRole('dialog').getByRole('button', { name: /Give what your letter asked for/ })
  await give.click()
  await expect(page.locator('.arena-toast')).toContainText(`${name} is so pleased!`)
  await expect(give).toHaveCount(0)
})
