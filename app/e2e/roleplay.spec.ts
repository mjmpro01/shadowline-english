import { expect, test, type Page } from '@playwright/test'
import { ROUTER_URL } from './environment'
import { asLearner, startFresh } from './session'

/**
 * Role-play with the tutor: it plays a part, says each of the learner's lines
 * more naturally under it, and ends with feedback. The stand-in router plays
 * the part from what it was sent, and knows one mistake to correct.
 */

async function sent(page: Page): Promise<{ role: string; content: string }[]> {
  return ((await (await page.request.get(`${ROUTER_URL}/last`)).json()) as {
    body: { messages: { role: string; content: string }[] }
  }).body.messages
}

test.beforeEach(async ({ page }) => {
  await startFresh(page)
  // A browser that cannot listen: the learner types.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    delete w.SpeechRecognition
    delete w.webkitSpeechRecognition
  })
  await asLearner(page)
})

test('an interview is played, each line said better, and ends in feedback kept to read again', async ({ page }) => {
  await page.goto('/dialogues')
  await page.getByRole('link', { name: 'Role-play' }).click()
  await page.waitForURL('**/dialogues/roleplay')

  const interview = page.getByRole('form', { name: 'Job interview' })
  await interview.getByLabel('The job (optional)').fill('marketing assistant')
  await interview.getByRole('button', { name: 'Start' }).click()
  await page.waitForURL(/\/dialogues\/roleplay\/[0-9a-f-]{36}$/)
  await expect(page.getByTestId('turn-0')).toContainText('Thanks for coming in. Could you tell me about yourself?')
  expect((await sent(page))[0].content).toContain('interview for: marketing assistant')

  // There is nothing to end before the learner has said anything.
  await expect(page.getByRole('button', { name: 'End and get feedback' })).toHaveCount(0)

  const box = page.getByRole('textbox', { name: 'Say or type your answer…' })
  await box.fill('I work in marketing since two years')
  await page.getByRole('button', { name: 'Send' }).click()
  const mine = page.getByTestId('turn-1')
  await expect(mine.getByTestId('better')).toContainText('I have worked in marketing for two years.')
  await expect(mine.getByTestId('better')).toContainText('hiện tại hoàn thành')
  await expect(page.getByTestId('turn-2')).toContainText('Great. Why do you want this job?')

  // A line that was fine says so, and Enter sends.
  await box.fill('I love working with brands.')
  await box.press('Enter')
  await expect(page.getByTestId('turn-3')).toContainText('Natural — nothing to change.')
  await expect(page.getByTestId('turn-4')).toContainText('You said: I love working with brands.')

  // A better line goes into the phrasebook with its reason.
  await mine.getByRole('button', { name: 'Copy to phrasebook' }).click()
  await expect(mine.getByLabel('Phrase', { exact: true })).toHaveValue('I have worked in marketing for two years.')
  await mine.getByRole('button', { name: 'Save' }).click()
  await expect(mine.getByText('In your phrasebook')).toBeVisible()

  await page.getByRole('button', { name: 'End and get feedback' }).click()
  const feedback = page.getByTestId('feedback')
  await expect(feedback).toContainText('Bạn trả lời tự tin và rõ ràng.')
  await expect(feedback).toContainText('Câu ngắn, dễ hiểu')
  await feedback.getByTestId('feedback-phrase-0').getByRole('button', { name: 'Copy to phrasebook' }).click()
  await feedback.getByTestId('feedback-phrase-0').getByRole('button', { name: 'Save' }).click()
  await expect(feedback.getByTestId('feedback-phrase-0').getByText('In your phrasebook')).toBeVisible()
  await expect(page.getByText('This role-play has ended.')).toBeVisible()
  await expect(box).toHaveCount(0)
  const sessionURL = page.url()

  // Kept: in the list, and as it was when opened again.
  await page.getByRole('link', { name: 'All role-plays' }).click()
  const row = page.getByTestId('roleplay-row')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Job interview · marketing assistant')
  await expect(row).toContainText('With feedback')
  await row.getByRole('link').click()
  await expect(page.getByTestId('turn-1').getByTestId('better')).toContainText('I have worked in marketing for two years.')
  await expect(page.getByTestId('feedback')).toContainText('Bạn trả lời tự tin')
  expect(page.url()).toBe(sessionURL)

  await page.goto('/dialogues/phrasebook')
  await expect(page.getByTestId('phrasebook-row')).toHaveCount(2)
  await expect(page.getByTestId('phrasebook-row').last()).toContainText('I have worked in marketing for two years.')

  // Played again, from the top; and the old one deleted.
  await page.goto(sessionURL)
  await page.getByRole('button', { name: 'Play it again' }).click()
  await expect(page).not.toHaveURL(sessionURL)
  await expect(page.getByTestId('turn-0')).toContainText('Thanks for coming in.')
  await page.getByRole('link', { name: 'All role-plays' }).click()
  await expect(row).toHaveCount(2)
  page.once('dialog', (d) => void d.accept())
  await row.last().getByRole('button', { name: 'Delete' }).click()
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('In progress')
})

test('a dialogue is role-played from the other side, its phrases at hand', async ({ page }) => {
  await page.goto('/dialogues/ordering-a-coffee')
  await page.getByRole('button', { name: 'Role-play this dialogue' }).click()
  await page.waitForURL(/\/dialogues\/roleplay\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'Ordering a coffee' })).toBeVisible()
  await expect(page.getByTestId('turn-0')).toContainText('Hi there! What can I get for you?')
  await expect(page.getByTestId('roleplay-phrases')).toContainText('For here or to go?')

  const prompt = (await sent(page))[0].content
  expect(prompt).toContain('You play Barista. The learner plays You.')
  expect(prompt).toContain('Barista: Sure. For here or to go?')
})

test('the phone reaches role-play from Practice', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await page.goto('/train')
  await page.getByRole('link', { name: /Role-play with the tutor/ }).click()
  await page.waitForURL('**/dialogues/roleplay')
  await expect(page.locator('.tabbar-link').filter({ hasText: 'Practice' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('No role-plays yet.')).toBeVisible()
})
