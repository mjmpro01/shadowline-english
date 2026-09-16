import { expect, type Page } from '@playwright/test'

/**
 * Collects a few words by tapping them while practising.
 *
 * Vocabulary starts empty for every learner now. It used to be seeded in the
 * browser, which meant two learners shared the same word ids — so the memory
 * practice tests have to earn their deck the way a learner does.
 */
export async function collectSomeWords(page: Page, count = 4): Promise<string[]> {
  await page.goto('/library')
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')

  const words = page.locator('.caption-word')
  await expect(words.first()).toBeVisible()

  const collected: string[] = []
  for (let i = 0; collected.length < count && i < (await words.count()); i++) {
    const word = words.nth(i)
    const text = (await word.innerText()).trim()
    // Punctuation and repeats would give a deck smaller than the count asked for.
    const normalised = text.toLowerCase().replace(/[^a-z']/g, '')
    if (normalised.length < 3 || collected.includes(normalised)) continue

    await word.click()
    await expect(page.getByText('Added to Vocabulary')).toBeVisible()
    collected.push(normalised)
    await page.getByRole('button', { name: 'Close' }).click()
  }
  return collected
}
