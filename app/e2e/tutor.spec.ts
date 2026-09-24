import { expect, test } from '@playwright/test'
import { ROUTER_URL } from './environment'
import { asLearner, resetServer } from './session'
import { publishLesson } from './seed'

/**
 * The tutor chat, against a stand-in for 9router.
 *
 * The stand-in's answer is built from what it was sent, so what shows on screen
 * says whether the server gave the tutor the clip being looked at — which is the
 * part of this feature a mocked browser could never check.
 */

test.beforeEach(async ({ page }) => {
  await resetServer(page)
  await publishLesson(page)
  await asLearner(page)
})

const launcher = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Ask the tutor' })

test('a general question gets a streamed answer', async ({ page }) => {
  await page.goto('/library')
  await launcher(page).click()

  const panel = page.getByRole('dialog', { name: 'Tutor' })
  await expect(panel.getByText('General English questions')).toBeVisible()

  await panel.getByLabel('Ask the tutor…').fill('How do I stop dropping final sounds?')
  await panel.getByRole('button', { name: 'Send' }).click()

  // The stand-in only says this when no clip was sent, and quotes the question.
  const answer = panel.locator('.tutor-assistant').last()
  await expect(answer).toContainText('No clip is open', { timeout: 20_000 })
  await expect(answer).toContainText('How do I stop dropping final sounds?')
  // Markdown arrives as elements, not as asterisks.
  await expect(answer.locator('strong')).toHaveText('final')
  await expect(answer.locator('li')).toHaveCount(1)
})

test('on a clip, the tutor is told which line it is', async ({ page }) => {
  await page.goto('/library')
  await page.getByLabel('Search the library').fill('Shadow this line 2')
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')

  await launcher(page).click()
  const panel = page.getByRole('dialog', { name: 'Tutor' })
  await expect(panel.getByText(/^Looking at: /)).toBeVisible()

  // A suggestion is a question in one tap.
  await panel.getByRole('button', { name: 'What should I fix in my last take?' }).click()
  await expect(panel.locator('.tutor-assistant').last()).toContainText(
    'The line is Shadow this line 2',
    { timeout: 20_000 },
  )

  // And the server — not the browser — put it there, with the key the browser
  // never sees.
  const sent = await (await page.request.get(`${ROUTER_URL}/last`)).json()
  expect(sent.headers.authorization).toBe('Bearer e2e-router-key')
  expect(sent.body.model).toBe('e2e/fake-model')
  expect(sent.body.messages[0].role).toBe('system')
  expect(sent.body.messages[0].content).toContain('Line: "Shadow this line 2"')
})

test('the conversation survives moving between screens', async ({ page }) => {
  await page.goto('/library')
  await launcher(page).click()
  const panel = page.getByRole('dialog', { name: 'Tutor' })
  await panel.getByLabel('Ask the tutor…').fill('Remember me')
  await panel.getByLabel('Ask the tutor…').press('Enter')
  await expect(panel.locator('.tutor-assistant').last()).toContainText('You asked: Remember me', {
    timeout: 20_000,
  })

  // Through the app's own navigation: the chat lives in the shell, not the screen.
  await page.locator('.menu-plank').filter({ hasText: 'Vocabulary' }).click()
  await expect(page).toHaveURL(/\/vocabulary$/)
  await expect(panel.getByText('Remember me', { exact: true })).toBeVisible()

  // And starting over is one button.
  await panel.getByRole('button', { name: 'New chat' }).click()
  await expect(panel.locator('.tutor-turn')).toHaveCount(0)
})

test('the key never reaches the browser', async ({ page }) => {
  const bodies: string[] = []
  page.on('response', async (response) => {
    if (response.url().includes('/api/')) {
      try {
        bodies.push(await response.text())
      } catch {
        /* a streamed or aborted body */
      }
    }
  })
  await page.goto('/library')
  await launcher(page).click()
  await page.getByRole('dialog', { name: 'Tutor' }).getByLabel('Ask the tutor…').fill('hi')
  await page.getByRole('dialog', { name: 'Tutor' }).getByRole('button', { name: 'Send' }).click()
  await expect(page.locator('.tutor-assistant').last()).toContainText('You asked: hi', { timeout: 20_000 })

  expect(bodies.join('\n')).not.toContain('e2e-router-key')
})
