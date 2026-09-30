import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { LEARNER_EMAIL } from './environment'
import { feature, publishLesson } from './seed'
import { resetServer, signIn } from './session'

/**
 * The guided tour: popups that walk a new learner through their first line by
 * having them press each button.
 *
 * Every other test signs in as a browser that has already seen the tour. These
 * seed through the usual page, then sign the learner in on a second page of the
 * same context that has not, with the flag cleared, as a first visit would be.
 */
async function firstVisit(page: Page, context: BrowserContext): Promise<Page> {
  await resetServer(page)
  await publishLesson(page)
  await feature(page, 'Shadow this line 1')
  const learner = await context.newPage()
  await signIn(learner, LEARNER_EMAIL, { tour: true })
  await learner.evaluate(() => localStorage.removeItem('shadowline.tour'))
  await learner.reload()
  return learner
}

const bubble = (page: Page) => page.getByRole('dialog')

test('a new learner is walked through their first line, one button at a time', async ({ page, context }) => {
  test.setTimeout(120_000)
  const learner = await firstVisit(page, context)

  await expect(bubble(learner)).toContainText('Welcome to Shadowline!')
  await learner.getByRole('button', { name: 'Show me' }).click()

  // Pointing at the first-line button, and only that answers: the menu beside
  // it is held off until it has been pressed.
  await expect(bubble(learner)).toContainText('Open your first line')
  await expect(bubble(learner)).toContainText('Press the lit-up button')
  const library = learner.locator('.sidebar').getByRole('link', { name: 'Library' })
  const box = await library.boundingBox()
  if (!box) throw new Error('no menu')
  await learner.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(learner).toHaveURL(/\/dashboard$/)

  await learner.getByRole('button', { name: 'Practise my first line' }).click()
  await expect(learner).toHaveURL(/\/practice$/)

  await expect(bubble(learner)).toContainText('Listen first')
  await bubble(learner).getByRole('button', { name: 'Next' }).click()
  await expect(bubble(learner)).toContainText('Tap a word to keep it')
  await bubble(learner).getByRole('button', { name: 'Next' }).click()

  await expect(bubble(learner)).toContainText('Now say it back')
  await learner.getByRole('button', { name: 'Record', exact: true }).click()
  await expect(bubble(learner)).toContainText('Watch the two waves')
  await bubble(learner).getByRole('button', { name: 'Next' }).click()

  // The score takes a few seconds, and the tour says so while it waits. The
  // featured clips include starters with no original sound, and for those the
  // popup says why there is no score instead of explaining one.
  await expect(bubble(learner)).toContainText(/Your score|Your take is kept/, { timeout: 30_000 })
  await bubble(learner).getByRole('button', { name: 'Next' }).click()
  await expect(bubble(learner)).toContainText('What next')
  await bubble(learner).getByRole('button', { name: 'Next' }).click()
  await expect(bubble(learner)).toContainText('Your words')
  await bubble(learner).getByRole('button', { name: 'Next' }).click()

  await expect(bubble(learner)).toContainText('That is it!')
  await learner.getByRole('button', { name: 'Start practising' }).click()
  await expect(learner.locator('.tour, .tour-pill')).toHaveCount(0)

  // Done is done: it does not start again.
  await learner.goto('/dashboard')
  await learner.waitForTimeout(1000)
  await expect(learner.locator('.tour')).toHaveCount(0)
})

test('skipping it puts it away for good, and Profile brings it back', async ({ page, context }) => {
  const learner = await firstVisit(page, context)

  await expect(bubble(learner)).toContainText('Welcome to Shadowline!')
  await learner.getByRole('button', { name: 'Skip the tour' }).click()
  await expect(learner.locator('.tour')).toHaveCount(0)

  await learner.reload()
  await learner.waitForTimeout(1000)
  await expect(learner.locator('.tour')).toHaveCount(0)

  await learner.goto('/profile')
  await learner.getByRole('button', { name: 'Take the guided tour' }).click()
  await expect(learner).toHaveURL(/\/dashboard$/)
  await expect(bubble(learner)).toContainText('Welcome to Shadowline!')
})

test('away from where a step happens, it says where to go and leaves the screen alone', async ({ page, context }) => {
  const learner = await firstVisit(page, context)
  await learner.getByRole('button', { name: 'Show me' }).click()
  await learner.getByRole('button', { name: 'Practise my first line' }).click()
  await expect(bubble(learner)).toContainText('Listen first')

  // Typed into the address bar: a reload, which the tour survives.
  await learner.goto('/vocabulary')
  await expect(learner.getByTestId('tour-waiting')).toContainText('Open a clip and press Practice')
  await expect(learner.locator('.tour-hole, .tour-backdrop')).toHaveCount(0)
})

test('taken again by a learner who has practised, it points at a clip to practise', async ({ page, context }) => {
  const learner = await firstVisit(page, context)
  await learner.getByRole('button', { name: 'Skip the tour' }).click()
  // A take, so the first-steps card with its button is gone from the dashboard.
  await learner.getByRole('button', { name: 'Practise my first line' }).click()
  await learner.getByRole('button', { name: 'Record', exact: true }).click()
  await expect(learner.getByRole('button', { name: 'Re-record', exact: true })).toBeVisible({ timeout: 20_000 })

  await learner.goto('/profile')
  await learner.getByRole('button', { name: 'Take the guided tour' }).click()
  await bubble(learner).getByRole('button', { name: 'Show me' }).click()
  await expect(bubble(learner)).toContainText('Open your first line')
  await learner.locator('[data-tour="practice-clip"]').first().click()
  await expect(learner).toHaveURL(/\/practice$/)
  await expect(bubble(learner)).toContainText('Listen first')
})
