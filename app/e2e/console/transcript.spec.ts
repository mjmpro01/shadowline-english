import { expect, test } from '@playwright/test'
import { API_URL, APP_URL } from '../environment'
import { VIDEO_CLIP as CLIP } from '../fixtures'
import { asAdmin, resetServer } from '../session'

/**
 * The studio filling its own lines in.
 *
 * Whisper itself does not run here: the model is hundreds of megabytes fetched
 * from somewhere CI has no business reaching, and its accuracy is not something
 * these could establish anyway. A test-only route stands in for the worker —
 * the worker's own behaviour is covered against a real database in
 * ../../scoring/tests/test_transcriber.py. What these check is what an admin
 * sees: words arriving, landing in the right clip, and never overwriting a
 * correction.
 */

/** Words placed inside the fixture's three cuts, which fall near 0–1.8, 3–4.8
 *  and 6–7.8 seconds. */
const WORDS = [
  { start: 0.2, end: 0.6, text: 'One', ipa: 'ˈwʌn' },
  { start: 0.7, end: 1.1, text: 'step', ipa: 'ˈstɛp' },
  { start: 3.2, end: 3.6, text: 'It', ipa: 'ˈɪt' },
  { start: 3.7, end: 4.2, text: 'was', ipa: 'ˈwɑz' },
  { start: 6.2, end: 6.8, text: 'worth', ipa: 'ˈwɝθ' },
  { start: 6.9, end: 7.2, text: 'it.', ipa: 'ˈɪt' },
]

test.beforeEach(async ({ page }) => {
  await resetServer(page)
  await asAdmin(page)
  await page.goto('/admin/cut')
})

async function upload(page: import('@playwright/test').Page) {
  await page.locator('input[type=file]').setInputFiles(CLIP)
  await expect(page.locator('.waveform')).toBeVisible({ timeout: 30_000 })
  // The recording goes up in the background; the transcript cannot be stored
  // against it until it is there.
  await expect(page.getByText(/Transcribing|Listening for the words/)).toBeVisible()
}

async function deliverTranscript(page: import('@playwright/test').Page, words = WORDS) {
  await expect
    .poll(
      async () => (await page.request.post(`${API_URL}/test/transcript`, { data: { words } })).status(),
      { timeout: 30_000 },
    )
    .toBe(200)
}

test('the words arrive and fill the lines in', async ({ page }) => {
  await upload(page)
  await deliverTranscript(page)

  await expect(page.locator('#line-0')).toHaveValue('One step', { timeout: 30_000 })
  await expect(page.locator('#line-1')).toHaveValue('It was')
  await expect(page.locator('#line-2')).toHaveValue('worth it.')

  // And the admin is told what happened, rather than the fields changing under
  // them with no explanation.
  await expect(page.getByText(/Transcribed 6 words/)).toBeVisible()
})

test('each clip gets the words spoken inside it, not the whole recording', async ({ page }) => {
  await upload(page)
  await deliverTranscript(page)

  await expect(page.locator('#line-0')).toHaveValue('One step', { timeout: 30_000 })
  // The give-away that the mapping is by time: no clip carries another's words.
  await expect(page.locator('#line-0')).not.toHaveValue(/worth/)
  await expect(page.locator('#line-2')).not.toHaveValue(/One/)
})

test('IPA is filled in alongside the line', async ({ page }) => {
  await upload(page)
  await deliverTranscript(page)

  await expect(page.locator('#ipa-0')).toHaveValue('/ˈwʌn ˈstɛp/', { timeout: 30_000 })
  await expect(page.locator('#ipa-1')).toHaveValue('/ˈɪt ˈwɑz/')
})

test('a line the admin has already typed is left alone', async ({ page }) => {
  await upload(page)

  await page.locator('#line-0').fill('What I actually heard')
  await deliverTranscript(page)

  // The rest fill in, so the transcript did arrive — and the correction stands.
  await expect(page.locator('#line-1')).toHaveValue('It was', { timeout: 30_000 })
  await expect(page.locator('#line-0')).toHaveValue('What I actually heard')
})

test('a clip with nothing spoken in it stays empty', async ({ page }) => {
  await upload(page)
  await deliverTranscript(page, WORDS.slice(0, 2))

  await expect(page.locator('#line-0')).toHaveValue('One step', { timeout: 30_000 })
  await expect(page.locator('#line-1')).toHaveValue('')
  await expect(page.locator('#ipa-1')).toHaveValue('')
})

test('the published clips carry the transcribed line', async ({ page }) => {
  await upload(page)
  await deliverTranscript(page)
  await expect(page.locator('#line-0')).toHaveValue('One step', { timeout: 30_000 })

  await page.getByRole('button', { name: /Publish \d+ clips/ }).click()
  await expect(page.getByText(/clips are now in the library/)).toBeVisible({ timeout: 60_000 })

  await page.goto(`${APP_URL}/library`)
  await page.getByLabel('Search the library').fill('One step')
  await expect(page.getByText('One step').first()).toBeVisible()
})
