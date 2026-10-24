import { expect, test } from '@playwright/test'
import { APP_URL, ROUTER_URL } from '../environment'
import { asAdmin, resetServer, signIn } from '../session'

/**
 * A dialogue, from the console to a learner: written by hand or drafted by the
 * tutor, edited, and published when ready.
 */

test.beforeEach(async ({ page }) => {
  await resetServer(page)
  await asAdmin(page)
})

test('a dialogue written in the console reaches a learner once it is published', async ({ page, browser }) => {
  await page.goto('/admin/dialogues')
  // The starters, all published.
  await expect(page.locator('.card', { hasText: 'Ordering a coffee' }).getByText('Published', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'New dialogue' }).click()
  const form = page.getByRole('form', { name: 'New dialogue' })
  await form.getByLabel('Title').fill('At the bakery')
  await form.getByLabel('Topic').fill('Food & drink')
  await form.getByLabel('Level').selectOption('A1')
  await form.getByLabel('Situation, in Vietnamese').fill('Bạn mua bánh ở tiệm.')
  const first = form.getByTestId('edit-line-0')
  await first.getByLabel('Name', { exact: true }).fill('Baker')
  await first.getByLabel('English').fill('Morning! What can I get you?')
  await first.getByLabel('Vietnamese').fill('Chào buổi sáng! Bạn lấy gì?')
  await form.getByTestId('edit-line-1').getByLabel('English').fill('Two croissants, please.')
  await form.getByRole('button', { name: 'Add a line' }).click()
  // The next line is the other person's, under their name.
  const third = form.getByTestId('edit-line-2')
  await expect(third.getByLabel('Speaker')).toHaveValue('A')
  await expect(third.getByLabel('Name', { exact: true })).toHaveValue('Baker')
  await third.getByLabel('English').fill('Anything else?')
  await third.getByRole('button', { name: 'Move up' }).click()
  await expect(form.getByTestId('edit-line-1').getByLabel('English')).toHaveValue('Anything else?')
  await form.getByTestId('edit-line-1').getByRole('button', { name: 'Move down' }).click()
  await form.getByRole('button', { name: 'Add a phrase' }).click()
  await form.getByTestId('edit-phrase-0').getByLabel('Phrase').fill('Anything else?')
  await form.getByTestId('edit-phrase-0').getByLabel('Note, in Vietnamese').fill('Người bán hỏi thêm.')
  await form.getByRole('button', { name: 'Save' }).click()

  const row = page.locator('.card', { hasText: 'At the bakery' })
  await expect(row.getByText('Draft', { exact: true })).toBeVisible()
  await expect(row).toContainText('3 lines')

  const theirs = await browser.newContext()
  const learner = await theirs.newPage()
  await signIn(learner, 'minh@example.com')
  await learner.goto(`${APP_URL}/dialogues`)
  await expect(learner.locator('.dialogue-card')).toHaveCount(10)

  await row.getByRole('button', { name: 'Publish' }).click()
  await expect(row.getByText('Published', { exact: true })).toBeVisible()
  await learner.reload()
  await expect(learner.locator('.dialogue-card')).toHaveCount(11)
  await learner.getByRole('link', { name: /At the bakery/ }).click()
  await expect(learner.getByTestId('line-1')).toContainText('Two croissants, please.')
  await expect(learner.getByTestId('line-2')).toContainText('Anything else?')
  await theirs.close()

  // A line edited away, and the dialogue deleted.
  await row.getByRole('button', { name: 'Edit' }).click()
  const edit = page.getByRole('form', { name: 'Edit dialogue' })
  await edit.getByTestId('edit-line-2').getByRole('button', { name: 'Remove' }).click()
  await expect(edit.getByTestId('edit-line-1').getByRole('button', { name: 'Remove' })).toBeDisabled()
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(row).toContainText('2 lines')
  await row.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.locator('.card', { hasText: 'At the bakery' })).toHaveCount(0)
})

test('the tutor drafts a dialogue for the admin to edit before saving', async ({ page }) => {
  await page.goto('/admin/dialogues')
  await page.getByRole('button', { name: 'New dialogue' }).click()
  const form = page.getByRole('form', { name: 'New dialogue' })
  await form.getByLabel('Level').selectOption('B1')
  await form.getByLabel('What is it about?').fill('Buying medicine at a pharmacy')
  await form.getByRole('button', { name: 'Write a draft' }).click()
  await expect(form.getByText('Drafted. Read it through')).toBeVisible()

  await expect(form.getByLabel('Title')).toHaveValue('Drafted: Buying medicine at a pharmacy')
  await expect(form.getByLabel('Situation, in Vietnamese')).toHaveValue('Buying medicine at a pharmacy')
  await expect(form.getByTestId('edit-line-1').getByLabel('English')).toHaveValue(
    'Do you have something for a headache?',
  )
  await expect(form.getByTestId('edit-phrase-0').getByLabel('Phrase')).toHaveValue('Do you have something for …?')
  const sent = (await (await page.request.get(`${ROUTER_URL}/last`)).json()) as {
    body: { messages: { content: string }[]; max_tokens: number }
  }
  expect(sent.body.messages[0].content).toContain('CEFR level B1')
  expect(sent.body.max_tokens).toBeGreaterThan(700)

  // Nothing is kept until it is saved.
  await page.goto('/admin/dialogues')
  await expect(page.locator('.card', { hasText: 'Drafted:' })).toHaveCount(0)
})
