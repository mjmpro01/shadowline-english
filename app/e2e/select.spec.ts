import { expect, test } from '@playwright/test'
import { LESSON } from './fixtures'
import { asAdmin, resetServer } from './session'

/**
 * Choosing which cuts reach the library.
 *
 * A short recording is usually published whole, which is why everything starts
 * selected. A long one proposes a cut at every pause — hundreds of them, most
 * not dialogue worth shadowing — and publishing all of it was the only thing
 * the studio could do.
 */
test.beforeEach(async ({ page }) => {
  await resetServer(page)
  await asAdmin(page)
  await page.goto('/admin')
  await page.locator('input[type=file]').setInputFiles(LESSON)
  await expect(page.locator('.waveform-segment')).toHaveCount(4, { timeout: 15_000 })
})

const publishButton = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /Publish \d+ clips/ })

async function nameTheLines(page: import('@playwright/test').Page) {
  const inputs = page.locator('input[id^="line-"]')
  for (let i = 0; i < (await inputs.count()); i++) {
    await inputs.nth(i).fill(`Shadow this line ${i + 1}`)
  }
}

test('every proposal starts selected, so a short recording still publishes whole', async ({
  page,
}) => {
  await expect(page.getByText('4 of 4 clips selected to publish')).toBeVisible()
  await expect(publishButton(page)).toHaveText(/Publish 4 clips/)
})

test('unselecting a clip keeps it out of the library', async ({ page }) => {
  await nameTheLines(page)
  await page.getByLabel('Publish clip 2').uncheck()
  await page.getByLabel('Publish clip 4').uncheck()

  await expect(page.getByText('2 of 4 clips selected to publish')).toBeVisible()
  await expect(publishButton(page)).toHaveText(/Publish 2 clips/)

  await publishButton(page).click()
  await expect(page.getByText('2 clips are now in the library.')).toBeVisible({ timeout: 30_000 })

  await page.goto('/library')
  await expect(page.getByText('Shadow this line 1')).toBeVisible()
  await expect(page.getByText('Shadow this line 3')).toBeVisible()
  // The ones left behind were left behind.
  await expect(page.getByText('Shadow this line 2')).toHaveCount(0)
  await expect(page.getByText('Shadow this line 4')).toHaveCount(0)
})

test('select none and select all move the whole batch at once', async ({ page }) => {
  await page.getByRole('button', { name: 'Select none' }).click()
  await expect(page.getByText('0 of 4 clips selected to publish')).toBeVisible()
  // Nothing selected is nothing to publish, so the button refuses rather than
  // publishing an empty batch.
  await expect(publishButton(page)).toBeDisabled()

  await page.getByRole('button', { name: 'Select all' }).click()
  await expect(page.getByText('4 of 4 clips selected to publish')).toBeVisible()
  await expect(publishButton(page)).toBeEnabled()
})

// The one that matters on a long recording: a cut at every pause, and only some
// of them have anything said in them.
test('only clips with a line selects the ones that have words', async ({ page }) => {
  await page.locator('#line-0').fill('Something is said here')
  await page.locator('#line-2').fill('And here')

  await page.getByRole('button', { name: 'Only clips with a line' }).click()

  await expect(page.getByText('2 of 4 clips selected to publish')).toBeVisible()
  await expect(page.getByLabel('Publish clip 1')).toBeChecked()
  await expect(page.getByLabel('Publish clip 2')).not.toBeChecked()
  await expect(page.getByLabel('Publish clip 3')).toBeChecked()
  await expect(page.getByLabel('Publish clip 4')).not.toBeChecked()
})

// A clip that is staying behind cannot block the batch: its length is nobody's
// problem, because it is not going anywhere.
test('an over-long clip only blocks publishing while it is selected', async ({ page }) => {
  await nameTheLines(page)
  await page.getByRole('button', { name: 'Merge next' }).first().click()
  await page.getByRole('button', { name: 'Merge next' }).first().click()

  await expect(page.getByText(/longer than \d+s/)).toBeVisible()
  await expect(publishButton(page)).toBeDisabled()

  await page.getByLabel('Publish clip 1').uncheck()

  await expect(page.getByText(/longer than \d+s/)).toHaveCount(0)
  await expect(publishButton(page)).toBeEnabled()
})

test('splitting a clip keeps both halves in the batch', async ({ page }) => {
  await page.getByLabel('Publish clip 1').uncheck()
  await expect(page.getByText('3 of 4 clips selected to publish')).toBeVisible()

  // Focus the excluded clip and split it: the decision not to publish it is
  // about the clip, and both halves inherit it.
  await page.locator('.waveform').click({ position: { x: 20, y: 60 } })
  await page.getByRole('button', { name: 'Split at playhead' }).click()

  await expect(page.getByText('3 of 5 clips selected to publish')).toBeVisible()
})
