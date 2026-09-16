import type { Page } from '@playwright/test'
import { ADMIN_EMAIL, API_URL, LEARNER_EMAIL } from './environment'

/**
 * Signs in through the real OAuth route.
 *
 * Not a shortcut past it: the state parameter, the PKCE cookie, the session
 * cookie and ADMIN_EMAILS are all exercised, with only the provider faked. The
 * button on the login screen goes to the same place; `?email=` is how a test
 * says who to be, and the real provider has no way to honour it.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto(`${API_URL}/auth/google/start?email=${encodeURIComponent(email)}`)
  await page.waitForURL('**/dashboard')
}

export const asAdmin = (page: Page) => signIn(page, ADMIN_EMAIL)
export const asLearner = (page: Page) => signIn(page, LEARNER_EMAIL)

/**
 * Empties the database and republishes the starter library.
 *
 * The tests share one server, so without this they would see each other's clips
 * and takes. The route exists only when AUTH_FAKE=1, and a Go test asserts it is
 * absent otherwise.
 */
export async function resetServer(page: Page): Promise<void> {
  const response = await page.request.post(`${API_URL}/test/reset`)
  if (!response.ok()) throw new Error(`reset failed: ${response.status()} ${await response.text()}`)
}

/** Reset, then sign in — what almost every test wants first. */
export async function startFresh(page: Page, email = LEARNER_EMAIL): Promise<void> {
  await resetServer(page)
  await signIn(page, email)
}
