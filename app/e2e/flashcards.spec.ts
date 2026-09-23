import { expect, test } from '@playwright/test'
import { startFresh } from './session'
import { collectSomeWords } from './vocabulary'

/**
 * Memory practice, and the schedule behind it.
 *
 * The deck used to be every word a learner had ever collected, sorted. It is
 * what is due now, which is a different thing: answering a card moves it out
 * of reach, and how far depends on whether it was recalled.
 */
const startPractice = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /words? to review/ }).click()

test.beforeEach(async ({ page }) => {
  await startFresh(page)
  await collectSomeWords(page)
  await page.goto('/vocabulary')
})

test('every collected word is due the day it is collected', async ({ page }) => {
  // A new word has no schedule to wait for, and a deck that made you wait a
  // day before your first look at a word you just met would be absurd.
  await expect(page.getByRole('button', { name: '4 words to review' })).toBeVisible()
})

test('memory practice walks the deck and ends with a summary', async ({ page }) => {
  await startPractice(page)
  await expect(page).toHaveURL(/\/vocabulary\/practice$/)

  const total = Number((await page.locator('.tag.mono').innerText()).match(/of (\d+)/)?.[1])
  expect(total).toBeGreaterThan(0)

  for (let i = 0; i < total; i++) {
    await expect(page.locator('.tag.mono')).toHaveText(`${i + 1} of ${total}`)
    // The meaning is hidden until you have tried to recall it.
    await expect(page.getByRole('button', { name: 'Got it' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Reveal meaning' }).click()
    await page.getByRole('button', { name: 'Got it' }).click()
  }

  await expect(page.getByText(`Reviewed ${total} words — ${total} marked known`)).toBeVisible()
})

test('a word you have just forgotten comes back before you leave', async ({ page }) => {
  await startPractice(page)
  const total = Number((await page.locator('.tag.mono').innerText()).match(/of (\d+)/)?.[1])
  const forgotten = await page.getByRole('heading', { level: 2 }).innerText()

  await page.getByRole('button', { name: 'Reveal meaning' }).click()
  await page.getByRole('button', { name: 'Still learning' }).click()

  // The deck grew by one, and the word it grew by is the one that went.
  await expect(page.locator('.tag.mono')).toHaveText(`2 of ${total + 1}`)
  for (let i = 1; i < total; i++) {
    await page.getByRole('button', { name: 'Reveal meaning' }).click()
    await page.getByRole('button', { name: 'Got it' }).click()
  }
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(forgotten)
})

test('an answer changes the word status in the vocabulary', async ({ page }) => {
  await startPractice(page)
  const word = await page.getByRole('heading', { level: 2 }).innerText()

  await page.getByRole('button', { name: 'Reveal meaning' }).click()
  await page.getByRole('button', { name: 'Got it' }).click()

  await page.goto('/vocabulary')
  // Filter on the card's own title: a clip title quoted on another card can
  // contain this word too.
  const card = page.locator('.grid-vocab .card').filter({ has: page.getByText(word, { exact: true }) })
  await expect(card.locator('.tag')).toHaveText('Known')
  // And it says when it is coming back, which is the schedule made visible.
  await expect(card).toContainText('Due tomorrow')
})

test('a word you recalled is not in the next deck', async ({ page }) => {
  await startPractice(page)
  const recalled = await page.getByRole('heading', { level: 2 }).innerText()
  await page.getByRole('button', { name: 'Reveal meaning' }).click()
  await page.getByRole('button', { name: 'Got it' }).click()

  await page.goto('/vocabulary')
  await expect(page.getByRole('button', { name: '3 words to review' })).toBeVisible()

  await startPractice(page)
  await expect(page.getByRole('heading', { level: 2 })).not.toHaveText(recalled)
})

test('with nothing due the screen says so and still lets you practise', async ({ page }) => {
  await startPractice(page)
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Reveal meaning' }).click()
    await page.getByRole('button', { name: 'Got it' }).click()
  }

  await page.goto('/vocabulary')
  await expect(page.getByText('Nothing to review today.')).toBeVisible()
  await expect(page.getByText(/The next word is due tomorrow/)).toBeVisible()

  // The schedule is advice, not a lock on the door.
  await page.getByRole('button', { name: 'Practise anyway' }).click()
  await expect(page).toHaveURL(/\/vocabulary\/practice\?all=1$/)
  await expect(page.locator('.tag.mono')).toHaveText('1 of 4')
})

test('the speaking prompt shows a sentence to use the word in', async ({ page }) => {
  await startPractice(page)
  await page.getByRole('button', { name: 'Reveal meaning' }).click()

  await expect(page.getByRole('button', { name: 'Say it aloud' })).toBeVisible()
  await page.getByRole('button', { name: 'Say it aloud' }).click()
  await expect(page.getByRole('button', { name: 'Said it aloud' })).toBeVisible()
})
