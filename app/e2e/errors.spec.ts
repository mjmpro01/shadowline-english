import { expect, test, type Page } from '@playwright/test'
import { APP_URL } from './environment'
import { practiseFirstClip } from './library'
import { asLearner, startFresh } from './session'

/**
 * What a learner reads when the server says no, in the language they chose.
 *
 * The server's messages are English; the ones a learner can meet carry a code
 * that the app translates by. The first test is the real server's answer; the
 * other two stand in for limits that take dozens of requests to reach.
 */

async function inVietnamese(page: Page) {
  await page.addInitScript(() => localStorage.setItem('shadowline.locale', 'vi'))
}

test('an email sign-in this server cannot do is explained in Vietnamese', async ({ page }) => {
  await inVietnamese(page)
  await page.context().clearCookies()
  await page.goto('/login')
  await page.locator('input[type="email"]').fill('hoc@example.com')
  await page.locator('input[type="password"]').fill('mat-khau-dai')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Máy chủ này chưa bật đăng nhập bằng email')
  await expect(page.getByText('email login is not configured')).toHaveCount(0)
})

test('the tutor’s refusal says how long to wait, in Vietnamese', async ({ page }) => {
  await startFresh(page)
  await asLearner(page)
  await inVietnamese(page)
  await page.route('**/api/tutor/chat', (route) =>
    route.fulfill({
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '42',
        'Access-Control-Allow-Origin': APP_URL,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Expose-Headers': 'Retry-After',
      },
      body: JSON.stringify({ error: 'that is a lot of questions at once — try again in 42 seconds', code: 'tutor.window' }),
    }),
  )
  await page.goto('/library')
  await page.getByRole('button', { name: 'Hỏi gia sư' }).click()
  const panel = page.getByRole('dialog', { name: 'Gia sư' })
  await panel.getByLabel('Hỏi gia sư…').fill('Phát âm "th" thế nào?')
  await panel.getByRole('button', { name: 'Gửi' }).click()
  await expect(panel.getByText('Bạn hỏi dồn dập quá — thử lại sau 42 giây.')).toBeVisible()
})

// It used to be dropped: the popup said it was looking the word up for as long
// as it stayed open.
test('a word lookup turned down by the hourly limit says so', async ({ page }) => {
  await startFresh(page)
  await asLearner(page)
  // Onto a line in English, then the same screen in Vietnamese.
  await practiseFirstClip(page)
  await inVietnamese(page)
  await page.reload()
  await page.route(/\/api\/words\/[^/]+$/, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': APP_URL,
            'Access-Control-Allow-Credentials': 'true',
          },
          body: JSON.stringify({ error: 'that is a lot of new words — try again in a while', code: 'limit.words' }),
        })
      : route.continue(),
  )
  await page.locator('.caption-word').first().click()
  await expect(page.getByText('Bạn vừa tra rất nhiều từ mới — thử lại sau một lúc.')).toBeVisible()
  await expect(page.getByText('Đang tra từ này…')).toHaveCount(0)
})
