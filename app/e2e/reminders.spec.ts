import { expect, test, type Page } from '@playwright/test'
import { API_URL } from './environment'
import { asLearner, startFresh } from './session'

/**
 * Headless Chromium cannot reach a push service, so the browser's half is a
 * stand-in: permission granted, and a subscription with a fixed address. What
 * the server does with it — signing, encrypting, sending — is tested in Go.
 */
async function fakePush(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let current: unknown = null
    const sub = {
      endpoint: 'https://push.example/e2e',
      toJSON: () => ({ endpoint: 'https://push.example/e2e', keys: { p256dh: 'BKey', auth: 'auth' } }),
      unsubscribe: async () => {
        current = null
        return true
      },
    }
    const pushManager = {
      getSubscription: async () => current,
      subscribe: async () => {
        current = sub
        return sub
      },
    }
    const registration = { pushManager }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: async () => registration,
        register: async () => registration,
        ready: Promise.resolve(registration),
        addEventListener: () => undefined,
      },
    })
    if (!('PushManager' in window)) Object.defineProperty(window, 'PushManager', { value: function PushManager() {} })
    Object.defineProperty(Notification, 'requestPermission', { value: async () => 'granted' })
  })
}

test.beforeEach(async ({ page }) => {
  await startFresh(page)
  await fakePush(page)
})

test('reminders are turned on in the profile, and kept', async ({ page }) => {
  await asLearner(page)
  await page.goto('/profile')
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Study reminders' }) })
  const toggle = card.getByRole('switch', { name: 'Remind me to practise every day' })
  await expect(toggle).not.toBeChecked()

  await toggle.click()
  await expect(toggle).toBeChecked()
  await card.getByLabel('Remind me at').fill('07:30')
  await card.getByRole('checkbox', { name: 'When my streak is about to end' }).click()
  await expect(card.getByRole('checkbox', { name: 'When my streak is about to end' })).not.toBeChecked()

  // The server has it: this browser, the time, the choice.
  await expect
    .poll(async () => {
      const res = await page.request.get(`${API_URL}/api/reminders`)
      const prefs = (await res.json()) as { enabled: boolean; remindAt: string; streak: boolean; subscribed: boolean }
      return `${prefs.enabled} ${prefs.subscribed} ${prefs.remindAt} ${prefs.streak}`
    })
    .toBe('true true 07:30 false')

  await page.reload()
  const again = page.locator('section', { has: page.getByRole('heading', { name: 'Study reminders' }) })
  await expect(again.getByRole('switch', { name: 'Remind me to practise every day' })).toBeChecked()
  await expect(again.getByLabel('Remind me at')).toHaveValue('07:30')

  // A test goes nowhere from here — the address is a stand-in — and says so.
  await again.getByRole('button', { name: 'Send a test' }).click()
  await expect(again.getByRole('status')).toHaveText(/No device took it|Sent to/)

  await again.getByRole('switch', { name: 'Remind me to practise every day' }).click()
  await expect(again.getByRole('switch', { name: 'Remind me to practise every day' })).not.toBeChecked()
})

test('the day the goal is reached, the dashboard offers reminders once', async ({ page }) => {
  await asLearner(page)
  // A day's learning: the goal reached.
  const done = await page.request.post(`${API_URL}/api/test/activity`, { data: { kind: 'take', times: 10 } })
  expect(done.ok()).toBe(true)
  await page.goto('/dashboard')
  const prompt = page.getByRole('group', { name: 'Want a reminder tomorrow to keep your streak?' })
  await expect(page.locator('.today-card')).toBeVisible()
  await expect(prompt).toBeVisible()
  await prompt.getByRole('button', { name: 'Later' }).click()
  await expect(prompt).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.today-card')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Want a reminder tomorrow to keep your streak?' })).toHaveCount(0)
})
