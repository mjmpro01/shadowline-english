import { expect, test } from '@playwright/test'
import { LEARNER_EMAIL } from './environment'
import { resetServer, signIn } from './session'

test.beforeEach(async ({ page }) => {
  await resetServer(page)
})

/**
 * The first sign-in asks one thing before the app: which language is yours.
 * The answer picks the language the app talks in, and it is the account's, so a
 * second device opens in it without asking again.
 */
test('the first sign-in asks for the native language and the app follows it', async ({
  page,
  browser,
}) => {
  await signIn(page, LEARNER_EMAIL, { nativeLanguage: null })

  await expect(page.getByRole('heading', { name: 'What is your native language?' })).toBeVisible()
  // Nothing behind it yet: the question comes first.
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0)

  // Choosing switches the screen into that language before anything is saved.
  // Clicked where a learner clicks: the card, whose radio is visually hidden.
  await page.locator('label', { hasText: 'Tiếng Việt' }).click()
  await expect(page.getByRole('radio', { name: /Tiếng Việt/ })).toBeChecked()
  await expect(page.getByRole('heading', { name: 'Ngôn ngữ mẹ đẻ của bạn là gì?' })).toBeVisible()

  await page.getByRole('button', { name: 'Tiếp tục' }).click()
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible()

  // Asked once: loading again goes straight to the app.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible()
  await expect(page.getByRole('radio', { name: /Tiếng Việt/ })).toHaveCount(0)

  // A browser that has never seen this account opens in the learner's language.
  const fresh = await browser.newContext({ locale: 'en-US' })
  const other = await fresh.newPage()
  await signIn(other, LEARNER_EMAIL, { nativeLanguage: null })
  await expect(other.getByRole('heading', { name: 'Tổng quan' })).toBeVisible()
  await fresh.close()
})
