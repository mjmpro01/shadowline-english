import { expect, test } from '@playwright/test'
import { startFresh } from './session'
import { collectSomeWords } from './vocabulary'

test.beforeEach(async ({ page }) => {
  await startFresh(page)
  await collectSomeWords(page)
  await page.goto('/vocabulary')
})

test('memory practice walks the deck and ends with a summary', async ({ page }) => {
  await page.getByRole('button', { name: 'Memory practice' }).click()
  await expect(page).toHaveURL(/\/vocabulary\/practice$/)

  const total = Number((await page.locator('.tag.mono').innerText()).match(/of (\d+)/)?.[1])
  expect(total).toBeGreaterThan(0)

  for (let i = 0; i < total; i++) {
    await expect(page.locator('.tag.mono')).toHaveText(`${i + 1} of ${total}`)
    // The meaning is hidden until you have tried to recall it.
    await expect(page.getByRole('button', { name: 'Got it' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Reveal meaning' }).click()
    await page.getByRole('button', { name: i === 0 ? 'Still learning' : 'Got it' }).click()
  }

  await expect(page.getByText(`Reviewed ${total} words — ${total - 1} marked known`)).toBeVisible()
})

test('an answer changes the word status in the vocabulary', async ({ page }) => {
  await page.getByRole('button', { name: 'Memory practice' }).click()
  const word = await page.getByRole('heading', { level: 2 }).innerText()

  await page.getByRole('button', { name: 'Reveal meaning' }).click()
  await page.getByRole('button', { name: 'Got it' }).click()

  await page.goto('/vocabulary')
  // Filter on the card's own title: a clip title quoted on another card can
  // contain this word too.
  const card = page.locator('.grid-vocab .card').filter({ has: page.getByText(word, { exact: true }) })
  await expect(card.locator('.tag')).toHaveText('Known')
})

test('the least recently seen words come up first next time', async ({ page }) => {
  await page.getByRole('button', { name: 'Memory practice' }).click()
  const firstWord = await page.getByRole('heading', { level: 2 }).innerText()
  await page.getByRole('button', { name: 'Reveal meaning' }).click()
  await page.getByRole('button', { name: 'Got it' }).click()

  // Just-reviewed and now known, so it should not lead the next session.
  await page.goto('/vocabulary/practice')
  await expect(page.getByRole('heading', { level: 2 })).not.toHaveText(firstWord)
})

test('the speaking prompt shows a sentence to use the word in', async ({ page }) => {
  await page.getByRole('button', { name: 'Memory practice' }).click()
  await page.getByRole('button', { name: 'Reveal meaning' }).click()

  await expect(page.getByRole('button', { name: 'Say it aloud' })).toBeVisible()
  await page.getByRole('button', { name: 'Say it aloud' }).click()
  await expect(page.getByRole('button', { name: 'Said it aloud' })).toBeVisible()
})
