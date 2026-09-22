import { expect, test } from '@playwright/test'
import { practiseFirstClip } from './library'
import { startFresh } from './session'

/**
 * Tapping a word in a caption.
 *
 * The app used to answer this from a fifteen-word table compiled into the
 * bundle: every other word came back with the literal string
 * "Auto-translated definition" and a pronunciation that was just its own
 * spelling in slashes. Now the tap goes to the server, which queues a lookup
 * and keeps the answer for everybody.
 *
 * Both halves are checked, because both are free now. The 12,000 commonest
 * words are seeded from files checked in beside the worker before this suite
 * starts, exactly as a real deployment seeds itself, so an ordinary word
 * answers with a real definition and a real pronunciation and no key anywhere.
 * A word outside that list still goes through the queue, which is the path the
 * second test takes.
 *
 * What is not checked here is the paid sources. A model call costs money and is
 * worded differently every run; ../../../scoring/tests/test_glosser.py covers
 * that side against a stand-in.
 */

/** The word card, which is the one with a Close button on it. */
const popupOf = (page: import('@playwright/test').Page) =>
  page.locator('.card').filter({ has: page.getByRole('button', { name: 'Close' }) })

test.beforeEach(async ({ page }) => {
  await startFresh(page)
  await practiseFirstClip(page)
})

test('a tapped word comes back with a real pronunciation', async ({ page }) => {
  const words = page.locator('.caption-word')
  await expect(words.first()).toBeVisible()

  // The first word long enough that CMUdict is certain to have it.
  let tapped = ''
  const count = await words.count()
  for (let i = 0; i < count; i++) {
    const text = (await words.nth(i).innerText()).trim().toLowerCase().replace(/[^a-z']/g, '')
    if (text.length < 4) continue
    await words.nth(i).click()
    tapped = text
    break
  }
  expect(tapped, 'no word on the line was long enough to look up').not.toBe('')

  const popup = popupOf(page)
  await expect(popup.locator('.card-title')).toHaveText(tapped)

  // The lookup goes through the queue, so the first tap on a word nobody has
  // ever tapped waits for the worker. Two seconds is a poll and an API-free
  // CMUdict lookup, with room to spare.
  await expect(popup.locator('.mono')).not.toHaveText('', { timeout: 10_000 })

  const ipa = (await popup.locator('.mono').innerText()).trim()
  // The old fallback was the word's own spelling. Anything CMUdict produces has
  // phonemes in it that English spelling does not use.
  expect(ipa).not.toBe(`/${tapped}/`)
  expect(ipa, `"${tapped}" came back as ${ipa}`).toMatch(/[ˈˌɑæʌɔaʊɪɛɝiʊuŋʃʒθðɹəɡdʒtʃ]/)
})

test('the same word tapped again answers straight away', async ({ page }) => {
  const word = page.locator('.caption-word').first()
  const text = (await word.innerText()).trim().toLowerCase().replace(/[^a-z']/g, '')

  await word.click()
  const popup = popupOf(page)
  await expect(popup.locator('.mono')).not.toHaveText('', { timeout: 10_000 })
  const first = await popup.locator('.mono').innerText()
  await page.getByRole('button', { name: 'Close' }).click()

  // Collected on the first tap, so this one drops it again — the gloss is kept
  // either way, because it belongs to the word and not to anybody's card.
  await word.click()
  await expect(popupOf(page).locator('.card-title')).toHaveText(text)
  // Already looked up, so no wait at all: the request and the read are one call.
  await expect(popupOf(page).locator('.mono')).toHaveText(first, { timeout: 1000 })
})


test('a seeded word answers with a definition, not just a pronunciation', async ({ page }) => {
  const words = page.locator('.caption-word')
  await expect(words.first()).toBeVisible()

  // A word certain to be among the 12,000 commonest, so it is answered from the
  // seed rather than from the queue.
  let tapped = ''
  for (let i = 0; i < (await words.count()); i++) {
    const text = (await words.nth(i).innerText()).trim().toLowerCase().replace(/[^a-z']/g, '')
    if (text.length < 4) continue
    await words.nth(i).click()
    tapped = text
    break
  }
  expect(tapped, 'no word on the line was long enough to look up').not.toBe('')

  const popup = popupOf(page)
  const meaning = popup.locator('.card-body')
  await expect(meaning).not.toHaveText(/Looking this word up|No definition/, { timeout: 10_000 })

  const text = (await meaning.innerText()).trim()
  expect(text.length, `"${tapped}" came back as ${text}`).toBeGreaterThan(3)
  // A definition that is the word again is no help to the person who tapped it.
  expect(text.toLowerCase()).not.toBe(tapped)

  // CC BY-NC 4.0 requires the credit, so it is not decoration: it has to be on
  // screen wherever the definition is.
  await expect(popup.getByText(/FreeTalk Dictionary/)).toBeVisible()
})
