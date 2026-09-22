import { expect, test } from '@playwright/test'
import { asAdmin, asLearner, startFresh } from './session'
import { publishLesson } from './studio'

/**
 * The library as a tree: a series, its episodes, and the clips cut out of each.
 *
 * A grid of every clip is the right shape for forty clips and the wrong one for
 * a series — two hundred cards off one season say nothing about which episode
 * they came from or where anybody left off.
 */
const LINE = (n: number) => `Shadow this line ${n}`

/** The lesson fixture is published under this name, from this file. */
const SERIES = 'Lesson one'
const EPISODE = 'lesson.wav'

async function openSeries(page: import('@playwright/test').Page) {
  await page.goto('/library')
  await page.getByRole('button', { name: `Open ${SERIES}` }).click()
  await page.waitForURL('**/library/s/**')
}

async function openEpisode(page: import('@playwright/test').Page) {
  await openSeries(page)
  await page.getByRole('button', { name: `Open ${EPISODE}` }).click()
  await page.waitForURL('**/library/e/**')
}

test.beforeEach(async ({ page }) => {
  await startFresh(page)
  await publishLesson(page)
  await asLearner(page)
})

test('the library opens on series rather than on every clip at once', async ({ page }) => {
  await page.goto('/library')

  await expect(page.getByRole('button', { name: `Open ${SERIES}` })).toBeVisible()
  await expect(page.getByText('1 episode · 4 clips')).toBeVisible()
  // The clips are a level down, not on the front screen.
  await expect(page.getByText(LINE(1))).toHaveCount(0)
})

test('a series lists the recordings its clips were cut from', async ({ page }) => {
  await openSeries(page)

  await expect(page.getByRole('heading', { name: SERIES })).toBeVisible()
  await expect(page.getByRole('button', { name: `Open ${EPISODE}` })).toBeVisible()
})

test('an episode lists its clips in the order they were spoken', async ({ page }) => {
  await openEpisode(page)

  await expect(page.getByRole('heading', { name: EPISODE })).toBeVisible()
  const rows = page.locator('.playlist-row')
  await expect(rows).toHaveCount(4)

  // The published lesson was cut in this order, and the list reads that way.
  for (let i = 0; i < 4; i++) {
    await expect(rows.nth(i)).toContainText(LINE(i + 1))
  }
})

test('it says how far through the episode you are', async ({ page }) => {
  await openEpisode(page)

  await expect(page.getByText('4 clips · 0 practised')).toBeVisible()
  await expect(page.getByRole('img', { name: '0% practised' })).toBeVisible()
})

test('practice next goes to the first clip nobody has been to', async ({ page }) => {
  await openEpisode(page)

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

  // Back in the episode, the count has moved and "next" has stepped on.
  await openEpisode(page)
  await expect(page.getByText('4 clips · 1 practised')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Practice next — Clip 2' })).toBeVisible()
})

test('a row opens the clip it names', async ({ page }) => {
  await openEpisode(page)

  await page.locator('.playlist-row').nth(2).getByRole('button', { name: 'Practice' }).click()
  await page.waitForURL('**/practice')
  await expect(page.getByRole('heading', { name: 'Clip 3' })).toBeVisible()
  // The heading names the clip; the line is what there is to shadow. It is
  // rendered a word at a time, because every word is a button for adding it to
  // Vocabulary, so the words are joined back up to compare.
  const words = await page.locator('.caption-word').allInnerTexts()
  expect(words.join(' ')).toBe(LINE(3))
})

test('a series nobody published says so rather than showing an empty page', async ({ page }) => {
  await page.goto('/library/s/nothing-like-this')

  await expect(page.getByText(/That series is not in the library/)).toBeVisible()
})

// --------------------------------------------------------------------- search

test('search finds a series, an episode and a spoken line', async ({ page }) => {
  await page.goto('/library')
  await page.getByLabel('Search the library').fill('lesson')

  await expect(page.getByRole('heading', { name: 'Series' })).toBeVisible()
  await expect(page.getByRole('button', { name: `Open ${SERIES}` })).toBeVisible()
  await expect(page.getByRole('button', { name: `Open ${EPISODE}` })).toBeVisible()

  // A fragment of a line, which is how somebody half-remembering one types it.
  await page.getByLabel('Search the library').fill('this line 3')
  await expect(page.getByRole('heading', { name: 'Clips' })).toBeVisible()
  await expect(page.getByText(LINE(3))).toBeVisible()
})

test('search says when nothing matches rather than showing an empty grid', async ({ page }) => {
  await page.goto('/library')
  await page.getByLabel('Search the library').fill('nothing like this')

  await expect(page.getByText(/Nothing in the library matches/)).toBeVisible()

  // Clearing it puts the series back.
  await page.getByLabel('Search the library').fill('')
  await expect(page.getByRole('button', { name: `Open ${SERIES}` })).toBeVisible()
})

test('one letter is not a search', async ({ page }) => {
  await page.goto('/library')
  await page.getByLabel('Search the library').fill('l')

  await expect(page.getByText('Type two letters or more.')).toBeVisible()
})

// ------------------------------------------------------------------ the studio

test('an admin names a series, describes it and marks it hot', async ({ page }) => {
  await asAdmin(page)
  await page.goto('/admin')
  await page.getByText('Series (', { exact: false }).click()

  // By its slug, which is text on the card. The name is the value of an input,
  // and an input's value is not text content — filtering on it finds nothing.
  const card = page.locator('.card').filter({ hasText: '/lesson-one' })
  await card.getByLabel('About this series').fill('Ten seasons of it.')
  await card.getByLabel('About this series').press('Enter')
  await card.getByRole('button', { name: 'Mark hot' }).click()
  await expect(card.getByRole('button', { name: 'Hot', exact: true })).toBeVisible()

  // The learner sees both, and the hot one leads the library.
  await asLearner(page)
  await page.goto('/library')
  await expect(page.locator('.series-card').first()).toContainText(SERIES)
  await expect(page.locator('.series-card').first()).toContainText('Hot')

  await openSeries(page)
  await expect(page.getByText('Ten seasons of it.')).toBeVisible()
})

test('an admin renames an episode from the file it was cut from', async ({ page }) => {
  await asAdmin(page)
  await page.goto('/admin')
  await page.getByText('Series (', { exact: false }).click()

  // By its slug, which is text on the card. The name is the value of an input,
  // and an input's value is not text content — filtering on it finds nothing.
  const card = page.locator('.card').filter({ hasText: '/lesson-one' })
  await card.getByRole('button', { name: /episode/ }).click()
  await card.getByLabel('Episode name').fill('S01E01 — The pilot')
  await card.getByLabel('Episode name').press('Enter')

  await asLearner(page)
  await openSeries(page)
  await expect(page.getByRole('button', { name: 'Open S01E01 — The pilot' })).toBeVisible()
})
