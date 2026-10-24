import { expect, test, type Page } from '@playwright/test'
import { asLearner, startFresh } from './session'

/**
 * Dialogues: a conversation heard, read aloud a line at a time until each has
 * been said five times, said with one side hidden, and copied from into a
 * phrasebook of the learner's own.
 *
 * Headless Chromium has the speech recognition API but nothing behind it, so
 * each test says what the browser can hear: nothing, and the learner counts
 * their readings, or a stand-in that hears a sentence it is given.
 */

/** A browser that cannot listen at all. */
async function deaf(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    delete w.SpeechRecognition
    delete w.webkitSpeechRecognition
  })
}

/** A browser that hears whatever `window.said` holds when listening starts. */
async function hearing(page: Page) {
  await page.addInitScript(() => {
    class Heard {
      onresult: ((e: unknown) => void) | null = null
      onend: (() => void) | null = null
      onerror: ((e: unknown) => void) | null = null
      start() {
        const said = (window as unknown as { said: string }).said
        setTimeout(() => {
          this.onresult?.({ results: [[{ transcript: said }]] })
          this.onend?.()
        }, 50)
      }
      stop() {}
      abort() {}
    }
    const w = window as unknown as Record<string, unknown>
    delete w.SpeechRecognition
    w.webkitSpeechRecognition = Heard
  })
}

async function openCoffee(page: Page) {
  await page.locator('.menu-plank').filter({ hasText: 'Dialogues' }).click()
  await page.waitForURL('**/dialogues')
  await page.getByRole('link', { name: /Ordering a coffee/ }).click()
  await page.waitForURL('**/dialogues/ordering-a-coffee')
}

test.beforeEach(async ({ page }) => {
  await startFresh(page)
})

test('the dialogues are there to choose from, by topic', async ({ page }) => {
  await asLearner(page)
  await page.goto('/dialogues')
  const cards = page.locator('.dialogue-card')
  await expect(cards).toHaveCount(10)
  await expect(cards.first()).toContainText('0 of 8 lines known')

  await page.getByRole('group', { name: 'Topics' }).getByRole('button', { name: 'Work' }).click()
  await expect(cards).toHaveCount(3)
  await expect(cards.filter({ hasText: 'Rescheduling a meeting' })).toBeVisible()
  await page.getByRole('group', { name: 'Topics' }).getByRole('button', { name: 'All' }).click()
  await expect(cards).toHaveCount(10)
})

test('a line read aloud five times is known, counted by the learner where the browser cannot listen', async ({
  page,
}) => {
  await deaf(page)
  await asLearner(page)
  await openCoffee(page)
  await expect(page.locator('.menu-plank[aria-current="page"]')).toContainText('Dialogues')

  const first = page.getByTestId('line-0')
  await expect(first).toContainText('Hi there! What can I get for you?')
  await expect(page.getByText('This browser cannot hear you')).toBeVisible()
  for (let i = 1; i <= 5; i++) {
    await first.getByRole('button', { name: 'I read it once' }).click()
    await expect(first.getByLabel(`Read aloud ${i} of 5 times`)).toBeVisible()
  }
  await expect(first.getByText('Known')).toBeVisible()
  await expect(page.getByTestId('dialogue-known')).toHaveText('1 of 8 lines known')

  // Kept: the next visit, and the list, say so too.
  await page.reload()
  await expect(page.getByTestId('dialogue-known')).toHaveText('1 of 8 lines known')
  await page.getByRole('link', { name: 'All dialogues' }).click()
  await expect(page.locator('.dialogue-card').first()).toContainText('1 of 8 lines known')
})

test('what the browser hears is checked against the line', async ({ page }) => {
  await hearing(page)
  await asLearner(page)
  await openCoffee(page)
  await page.evaluate(() => {
    ;(window as unknown as { said: string }).said = 'can I get a large latte'
  })

  const line = page.getByTestId('line-1')
  await line.getByRole('button', { name: 'Read it aloud' }).click()
  // "Can I get a … latte" heard; "medium" and "please" not.
  await expect(line.getByText('Heard 5 of 7 words')).toBeVisible()
  await expect(line.locator('.dict-w[data-kind="missing"]')).toHaveText(['medium', 'please?'])
  await expect(line.getByLabel('Read aloud 1 of 5 times')).toBeVisible()

  // Nothing heard is not a reading.
  await page.evaluate(() => {
    ;(window as unknown as { said: string }).said = ''
  })
  await line.getByRole('button', { name: 'Read it aloud' }).click()
  await expect(line.getByText('Nothing was heard')).toBeVisible()
  await expect(line.getByLabel('Read aloud 1 of 5 times')).toBeVisible()
})

test('one side hidden, and the meaning shown', async ({ page }) => {
  await deaf(page)
  await asLearner(page)
  await openCoffee(page)

  await page.getByRole('button', { name: 'Vietnamese' }).click()
  await expect(page.getByText('Chào bạn! Bạn muốn gọi gì?')).toBeVisible()

  await page.getByRole('group', { name: 'Hide the lines of' }).getByRole('button', { name: 'You' }).click()
  const mine = page.getByTestId('line-1')
  await expect(mine.getByText('Can I get a medium latte, please?')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Show the line' })).toHaveCount(4)
  // The other side is still there to answer.
  await expect(page.getByTestId('line-0')).toContainText('Hi there!')

  await mine.getByRole('button', { name: 'Show the line' }).click()
  await expect(mine).toContainText('Can I get a medium latte, please?')
  await expect(page.getByRole('button', { name: 'Show the line' })).toHaveCount(3)

  await page.getByRole('group', { name: 'Hide the lines of' }).getByRole('button', { name: 'Nobody' }).click()
  await expect(page.getByRole('button', { name: 'Show the line' })).toHaveCount(0)
})

test('phrases are copied into the phrasebook, noted, found, rewritten and torn out', async ({ page }) => {
  await deaf(page)
  await asLearner(page)
  await openCoffee(page)

  // A suggested phrase, with the dialogue's note to start from.
  const suggested = page.getByTestId('phrase-1')
  await expect(suggested).toContainText('For here or to go?')
  await suggested.getByRole('button', { name: 'Copy to phrasebook' }).click()
  await expect(suggested.getByLabel('Phrase', { exact: true })).toHaveValue('For here or to go?')
  await expect(suggested.getByLabel('Situation')).toHaveValue('Bạn gọi đồ uống ở một quán cà phê.')
  await suggested.getByLabel('Context and feeling').fill('Nhân viên hỏi; mình đáp ngắn "To go".')
  await suggested.getByRole('button', { name: 'Save' }).click()
  await expect(suggested.getByText('In your phrasebook')).toBeVisible()

  // Any line of the dialogue, too.
  const line = page.getByTestId('line-7')
  await line.getByRole('button', { name: 'Copy to phrasebook' }).click()
  await expect(line.getByLabel('Phrase', { exact: true })).toHaveValue('Here you go. Keep the change.')
  await line.getByRole('button', { name: 'Save' }).click()
  await expect(line.getByText('In your phrasebook')).toBeVisible()

  await page.getByRole('link', { name: 'All dialogues' }).click()
  await page.getByRole('link', { name: 'Phrasebook' }).click()
  await page.waitForURL('**/dialogues/phrasebook')
  const rows = page.getByTestId('phrasebook-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('Here you go. Keep the change.')
  await expect(rows.first()).toContainText('No note yet.')
  await expect(rows.nth(1)).toContainText('Nhân viên hỏi')

  // A note written later, in place.
  await rows.first().getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Context and feeling').fill('Khi trả tiền và để lại tiền thừa.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(rows.first()).toContainText('Khi trả tiền và để lại tiền thừa.')

  await page.getByRole('searchbox', { name: 'Search your phrasebook' }).fill('to go')
  await expect(rows).toHaveCount(1)
  await page.getByRole('searchbox', { name: 'Search your phrasebook' }).fill('nothing like this')
  await expect(page.getByText('Nothing in your phrasebook matches')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search your phrasebook' }).fill('')

  // One written by hand.
  await page.getByRole('button', { name: 'Add a phrase' }).click()
  await page.getByLabel('Situation').fill('At a party')
  await page.getByLabel('Phrase', { exact: true }).fill('Long time no see!')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText('Long time no see!')

  page.once('dialog', (d) => void d.accept())
  await rows.first().getByRole('button', { name: 'Delete' }).click()
  await expect(rows).toHaveCount(2)
  await page.reload()
  await expect(rows).toHaveCount(2)
})

test('a phone has one tab for both kinds of practice', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await asLearner(page)
  await page.goto('/dashboard')
  const practice = page.locator('.tabbar-link').filter({ hasText: 'Practice' })
  await practice.click()
  await page.waitForURL('**/train')
  await expect(practice).toHaveAttribute('aria-current', 'page')

  await page.getByRole('link', { name: /Dialogues/ }).click()
  await page.waitForURL('**/dialogues')
  await expect(practice).toHaveAttribute('aria-current', 'page')
  await page.goBack()
  await page.getByRole('link', { name: /Dictation/ }).click()
  await page.waitForURL('**/dictation')
  await expect(practice).toHaveAttribute('aria-current', 'page')
})
