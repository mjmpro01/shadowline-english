import { expect, test, type Page } from '@playwright/test'
import { API_URL } from './environment'
import { asLearner, startFresh } from './session'
import { publishLesson } from './seed'

/**
 * Dictation, in its five steps: listen through, write each phrase down, check it
 * against what was said, shadow it, listen again — and again the next day, from
 * the dashboard.
 *
 * The lesson is four short lines with no transcript, so the passage is all four
 * and each line is one phrase to write down.
 */

async function openEpisode(page: Page) {
  await page.goto('/library')
  await page.getByRole('button', { name: 'Open Lesson one' }).click()
  await page.getByRole('button', { name: 'Open lesson.wav' }).click()
  await page.waitForURL('**/library/e/**')
}

test.beforeEach(async ({ page }) => {
  await startFresh(page)
  await publishLesson(page)
  await asLearner(page)
})

test('a passage is listened to, written down, checked, shadowed, and heard again tomorrow', async ({ page }) => {
  await openEpisode(page)
  await page.getByRole('button', { name: 'Dictation', exact: true }).click()
  await page.waitForURL('**/dictation/**')
  await expect(page.getByText('4 lines · 0:12')).toBeVisible()

  // 1 — the whole passage, with no text on screen.
  await expect(page.getByText('Shadow this line 1')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Play the whole passage' })).toBeEnabled()
  await page.getByRole('button', { name: 'Start writing' }).click()

  // 2 — a phrase at a time.
  const write = page.getByTestId('write')
  const box = write.getByRole('textbox')
  const next = write.getByRole('button', { name: /Next|Leave it blank|Check against/ })
  await expect(write).toContainText('Phrase 1 of 4')
  // Nothing written and not listened to: not yet.
  await expect(next).toBeDisabled()
  await write.getByRole('button', { name: 'Listen' }).click()
  await expect(page.getByTestId('listens')).toHaveText('Heard 1×')
  await expect(write).toContainText('First listen: write only the words you are sure of.')
  await box.fill('Shadow this line 1')
  await next.click()

  // A reload in the middle keeps what was written, and where.
  await expect(write).toContainText('Phrase 2 of 4')
  await page.reload()
  await expect(page.getByTestId('write')).toContainText('Phrase 2 of 4')
  await box.fill('shadow line 2')
  await next.click()

  // Ctrl+Enter plays it again; after three listens it may be left blank.
  await expect(write).toContainText('Phrase 3 of 4')
  await expect(next).toHaveText(/Leave it blank/)
  await box.focus()
  for (let i = 0; i < 3; i++) await box.press('Control+Enter')
  await expect(page.getByTestId('listens')).toHaveText('Heard 3×')
  await expect(write).toContainText('Third listen: check the endings')
  await next.click()

  await expect(write).toContainText('Phrase 4 of 4')
  await box.fill('shadow this lime 4')
  await next.click()

  // 3 — checked against what was said. 10 of the 16 words were heard.
  const check = page.getByTestId('check')
  await expect(page.getByTestId('accuracy')).toHaveText('63% heard')
  await expect(check).toContainText('10 of 16 words')
  // "this" left out is a short word, named without asking.
  const second = check.getByTestId('chunk').nth(1)
  await expect(second.getByTestId('mistake')).toHaveCount(1)
  await expect(second.getByTestId('mistake')).toContainText('Short word (a, the, of…)')
  // "lime" for "line" is the learner's to name; not knowing a word offers to keep it.
  const lime = check.getByTestId('chunk').nth(3).getByTestId('mistake')
  await expect(lime).toContainText('you wrote “lime”')
  await lime.getByRole('button', { name: 'Did not know the word' }).click()
  await lime.getByRole('button', { name: '+ Vocabulary' }).click()
  await expect(lime).toContainText('In your vocabulary')
  await expect(check.locator('[data-kind="unknownWord"]')).toHaveText('Did not know the word: 1')
  await expect(check.locator('[data-kind="shortWord"]')).toHaveText('Short word (a, the, of…): 2')
  await expect(check.locator('[data-kind="other"]')).toHaveText('Not tagged yet: 3')
  await page.getByRole('button', { name: 'Save and go on' }).click()

  // 4 — read along with the lines, and practise one.
  await expect(page.getByText('Shadow this line 3')).toBeVisible()
  await expect(page.getByTestId('passes')).toHaveText('0 passes')
  await page.getByRole('button', { name: 'Play and read along' }).click()
  await expect(page.getByTestId('passes')).toHaveText('1 pass', { timeout: 30_000 })
  await expect(page.getByRole('link', { name: 'Practise this line' })).toHaveCount(4)
  await page.getByRole('button', { name: 'Next' }).click()

  // 5 — once more without the text, and it is put down for tomorrow.
  await expect(page.getByText('Tomorrow it will be on your dashboard')).toBeVisible()
  await expect(page.getByText('Shadow this line 3')).toHaveCount(0)
  await page.getByRole('button', { name: 'Done' }).click()
  await page.waitForURL('**/dictation')
  // The tab keeps it, under what has been written down lately.
  await expect(page.getByTestId('dict-recent')).toContainText('Shadow this line 1')
  await expect(page.getByTestId('dict-recent')).toContainText('63% heard')

  // Not due today…
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByTestId('listen-again')).toHaveCount(0)

  // …and there tomorrow, when the last step is done from the dashboard.
  expect((await page.request.post(`${API_URL}/api/test/dictations/due`)).status()).toBe(204)
  // The tab has it too.
  await page.goto('/dictation')
  await expect(page.getByTestId('listen-again')).toContainText('Shadow this line 1')
  await page.goto('/dashboard')
  const card = page.getByTestId('listen-again')
  await expect(card).toContainText('Listen again today')
  await expect(card).toContainText('Shadow this line 1')
  await expect(card).toContainText('63% heard')
  await card.getByRole('button', { name: 'Listen again' }).click()
  await page.waitForURL('**/dictation/**?review=*')
  await expect(page.getByText('Yesterday’s passage')).toBeVisible()
  await expect(page.locator('.dict-step')).toHaveCount(1)
  await page.getByRole('button', { name: 'Done' }).click()
  await page.waitForURL('**/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByTestId('listen-again')).toHaveCount(0)
})

test('a dictation can start at any line of the episode', async ({ page }) => {
  await openEpisode(page)
  await page.locator('.playlist-row').nth(2).getByRole('button', { name: 'Dictation from this line' }).click()
  await page.waitForURL('**/dictation/**')
  // From the third line there are two left in the episode.
  await expect(page.getByText('2 lines · 0:07')).toBeVisible()
  await page.getByRole('button', { name: 'Start writing' }).click()
  await expect(page.getByTestId('write')).toContainText('Phrase 1 of 2')
})

test('the dictation tab has a passage to start on, and what is due today', async ({ page }) => {
  await page.goto('/dashboard')
  await page.locator('.menu-plank').filter({ hasText: 'Dictation' }).click()
  await page.waitForURL('**/dictation')
  await expect(page.getByRole('heading', { name: 'Dictation', level: 1 })).toBeVisible()
  await expect(page.getByTestId('listen-again')).toContainText('Nothing to listen to again today.')
  await expect(page.getByTestId('dict-recent')).toContainText('Nothing written down yet.')

  // By series, then episode, then the line to start at.
  await page.getByRole('button', { name: /Lesson one/ }).click()
  await page.getByRole('button', { name: /lesson\.wav/ }).click()
  await page.waitForURL('**/dictation/e/*')
  await expect(page.getByTestId('dict-start-line')).toHaveCount(4)
  await page.getByTestId('dict-start-line').nth(2).getByRole('button', { name: 'Dictation from this line' }).click()
  await page.waitForURL('**/dictation/e/*/*')
  await expect(page.getByText('2 lines · 0:07')).toBeVisible()
  // The tab stays lit through it.
  await expect(page.locator('.menu-plank[aria-current="page"]')).toContainText('Dictation')

  // Or by search, straight to a line.
  await page.goto('/dictation')
  await page.getByRole('searchbox', { name: 'Search series, episodes and lines' }).fill('line 4')
  const found = page.getByTestId('dict-found')
  await found.getByRole('button', { name: 'Dictation from this line' }).first().click()
  await page.waitForURL('**/dictation/e/*/*')
  await expect(page.getByText('1 line · 0:03')).toBeVisible()
})

test('the old address of a dictation still leads to it', async ({ page }) => {
  await openEpisode(page)
  const episode = page.url().split('/library/e/')[1]
  await page.goto(`/library/e/${episode}/dictation/nothing`)
  await page.waitForURL(`**/dictation/e/${episode}/nothing`)
})
