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
export async function signIn(
  page: Page,
  email: string,
  { tour = false, nativeLanguage = 'en' as string | null } = {},
): Promise<void> {
  // The guided tour starts by itself for a learner with no takes, and holds the
  // screen while it runs: every test not about the tour starts as a browser
  // that has already seen it. Scoped to this page, so a tour test can open a
  // second page in the same context that has not.
  if (!tour) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('shadowline.tour', 'done')
      } catch {
        // The API's own origin, before the redirect, may refuse; it has no tour.
      }
    })
  }
  await page.goto(`${API_URL}/auth/google/start?email=${encodeURIComponent(email)}`)
  await page.waitForURL('**/dashboard')
  // A new account is asked its native language before anything else shows.
  // Every test not about that question answers it here, the way the screen
  // would, and loads the app again past it. null leaves it unanswered.
  if (nativeLanguage) {
    const answered = await page.request.patch(`${API_URL}/api/profile`, {
      data: { nativeLanguage },
    })
    if (!answered.ok()) throw new Error(`answering the language: ${answered.status()}`)
    await page.reload()
  }
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
