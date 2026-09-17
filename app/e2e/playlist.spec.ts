import { expect, test } from '@playwright/test'
import { asLearner, startFresh } from './session'
import { publishLesson } from './studio'

/**
 * A playlist as a sequence rather than a grid.
 *
 * The library is right for browsing and wrong for an episode: two hundred cards
 * from one film say nothing about the order the lines were spoken in or where
 * you left off.
 */
const LINE = (n: number) => `Shadow this line ${n}`

async function openPlaylist(page: import('@playwright/test').Page) {
  await page.goto('/library')
  await page.getByRole('button', { name: 'Lesson one', exact: true }).click()
  await page.getByRole('button', { name: 'Open as playlist' }).click()
  await page.waitForURL('**/library/playlist/**')
}

test.beforeEach(async ({ page }) => {
  await startFresh(page)
  await publishLesson(page)
  await asLearner(page)
})

test('a playlist lists its clips in the order they were spoken', async ({ page }) => {
  await openPlaylist(page)

  await expect(page.getByRole('heading', { name: 'Lesson one' })).toBeVisible()
  const rows = page.locator('.playlist-row')
  await expect(rows).toHaveCount(4)

  // The published lesson was cut in this order, and the list reads that way.
  for (let i = 0; i < 4; i++) {
    await expect(rows.nth(i)).toContainText(LINE(i + 1))
  }
})

test('it says how far through the episode you are', async ({ page }) => {
  await openPlaylist(page)

  await expect(page.getByText('4 clips · 0 practised')).toBeVisible()
  await expect(page.getByRole('img', { name: '0% practised' })).toBeVisible()
})

test('practice next goes to the first clip nobody has been to', async ({ page }) => {
  await openPlaylist(page)

  // Named "Clip 1", because nobody typed a name for it — the line is what the
  // row below shows, and what the Practice screen puts on screen to shadow.
  await expect(page.getByRole('button', { name: 'Practice next — Clip 1' })).toBeVisible()
  await page.getByRole('button', { name: /Practice next/ }).click()
  await page.waitForURL('**/practice')
  await expect(page.getByRole('heading', { name: 'Clip 1' })).toBeVisible()

  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByText('Take recorded').or(page.getByText('PITCH MATCH SCORE'))).toBeVisible({
    timeout: 30_000,
  })

  // Back on the playlist, the count has moved and "next" has stepped on.
  await openPlaylist(page)
  await expect(page.getByText('4 clips · 1 practised')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Practice next — Clip 2' })).toBeVisible()
})

test('a row opens the clip it names', async ({ page }) => {
  await openPlaylist(page)

  await page.locator('.playlist-row').nth(2).getByRole('button', { name: 'Practice' }).click()
  await page.waitForURL('**/practice')
  await expect(page.getByRole('heading', { name: 'Clip 3' })).toBeVisible()
  // The heading names the clip; the line is what there is to shadow. It is
  // rendered a word at a time, because every word is a button for adding it to
  // Vocabulary, so the words are joined back up to compare.
  const words = await page.locator('.caption-word').allInnerTexts()
  expect(words.join(' ')).toBe(LINE(3))
})

test('a playlist nobody published says so rather than showing an empty page', async ({ page }) => {
  await page.goto('/library/playlist/Nothing%20like%20this')

  await expect(page.getByRole('heading', { name: 'Nothing like this' })).toBeVisible()
  await expect(page.getByText(/No clips in this playlist/)).toBeVisible()
})
