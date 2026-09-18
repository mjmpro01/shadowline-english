import { expect, test } from '@playwright/test'
import { asLearner, startFresh } from './session'
import { publishLesson } from './studio'

/** Long enough for the fake microphone to play through most of the clip. */
const RECORD_MS = 2600

test.beforeEach(async ({ page }) => {
  await startFresh(page)
  await page.goto('/library')
})

async function recordOnce(page: import('@playwright/test').Page, label: 'Record' | 'Re-record') {
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.waitForTimeout(RECORD_MS)
  await page.getByRole('button', { name: 'Stop' }).click()
}

/**
 * Opens a clip by name.
 *
 * By name rather than by position: the library holds the starter clips as well
 * as whatever a test published, and the starter clips carry no audio — so
 * practising the first card would measure a take that can never be scored.
 */
async function practise(page: import('@playwright/test').Page, title: string) {
  await page.goto('/library')
  await page.getByLabel('Search clips').fill(title)
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')
}

/** The published lesson's lines, in the order the studio cut them. */
const LINE = (n: number) => `Shadow this line ${n}`
/** A starter clip, which ships with no source audio. */
const STARTER = 'One step at a time'

async function scoreOf(page: import('@playwright/test').Page): Promise<number> {
  const card = page.locator('.card', { hasText: 'PITCH MATCH SCORE' })
  await expect(card).toBeVisible({ timeout: 20_000 })
  // The number itself, by name. This used to read the card's last div, which
  // made every change to the card's shape a failing score test.
  //
  // It counts up when it lands, so reading it once can catch it mid-climb.
  // Polling until two reads in a row agree waits for the climb to finish
  // without hard-coding how long the animation takes.
  const number = card.locator('.score-badge-number')
  let previous = ''
  await expect
    .poll(
      async () => {
        const now = (await number.innerText()).trim()
        const settled = now === previous && now !== '0'
        previous = now
        return settled
      },
      { timeout: 10_000 },
    )
    .toBe(true)
  return Number(previous)
}

test('a starter clip has no original audio, so a take is kept but not scored', async ({ page }) => {
  await practise(page, STARTER)
  await recordOnce(page, 'Record')

  await expect(page.getByText('Take recorded')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('nothing to score your delivery against')).toBeVisible()
  await expect(page.getByText('PITCH MATCH SCORE')).toHaveCount(0)
})

test('a published clip scores takes against its own audio', async ({ page }) => {
  await publishLesson(page)
  await asLearner(page)
  await practise(page, LINE(1))
  await expect(page.getByRole('button', { name: 'Hear clip again' })).toBeEnabled()

  await recordOnce(page, 'Record')
  // The fixture shadows the melodic line closely, so it should score well.
  expect(await scoreOf(page)).toBeGreaterThan(60)

  await page.getByRole('button', { name: 'See analysis' }).click()
  await page.waitForURL(/library\/[^/]+$/)

  await expect(page.locator('.tag', { hasText: 'measured' })).toBeVisible()
  await expect(page.locator('.grid-scores .card')).toHaveCount(4)
  await expect(page.getByText('semitones from the source')).toBeVisible()
})

test('each clip is scored against its own audio, not the last one seen', async ({ page }) => {
  await publishLesson(page)
  await asLearner(page)

  const scoreClip = async (title: string) => {
    await practise(page, title)
    await recordOnce(page, 'Record')
    const score = await scoreOf(page)
    await page.getByRole('button', { name: 'Exit' }).click()
    await page.waitForURL('**/library')
    return score
  }

  // The microphone plays a shadow of the melodic line both times; the second
  // published clip is flat, so it cannot score as well.
  const melodic = await scoreClip(LINE(1))
  const flat = await scoreClip(LINE(2))

  expect(melodic).toBeGreaterThan(60)
  expect(flat).toBeLessThan(melodic - 10)
})

test('both voices play on one timeline in dub review', async ({ page }) => {
  await publishLesson(page)
  await asLearner(page)
  await practise(page, LINE(1))
  await recordOnce(page, 'Record')
  await expect(page.getByRole('button', { name: 'Dub review' })).toBeEnabled({ timeout: 20_000 })

  await page.getByRole('button', { name: 'Dub review' }).click()
  await page.waitForURL('**/dub')

  await page.getByRole('button', { name: 'Play' }).click()
  await page.waitForTimeout(1200)
  const before = await page.evaluate(() => {
    const el = document.querySelector('audio')!
    return { src: el.currentSrc, time: el.currentTime }
  })
  expect(before.time).toBeGreaterThan(0.5)

  await page.getByText('Original', { exact: true }).click()
  await page.waitForTimeout(600)
  const after = await page.evaluate(() => {
    const el = document.querySelector('audio')!
    return { src: el.currentSrc, time: el.currentTime, paused: el.paused }
  })

  expect(after.src).not.toBe(before.src)
  expect(after.paused).toBe(false)
  // Switching voices keeps your place rather than restarting the line.
  expect(after.time).toBeGreaterThanOrEqual(before.time - 0.2)
})

test('recording stops itself at the clip limit', async ({ page }) => {
  await practise(page, STARTER)

  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await expect(page.getByText('s left')).toBeVisible()

  // Never pressed: the recorder ends the take on its own.
  await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden({ timeout: 15_000 })
  await expect(page.getByText('Take recorded')).toBeVisible({ timeout: 20_000 })
})

test('learners can search the library and filter it by category', async ({ page }) => {
  await publishLesson(page)
  await asLearner(page)
  await page.goto('/library')

  await page.getByLabel('Search clips').fill('line 3')
  await expect(page.locator('.grid-cards .card')).toHaveCount(1)
  await expect(page.getByText('Shadow this line 3')).toBeVisible()

  await page.getByLabel('Search clips').fill('nothing like this')
  await expect(page.getByText(/Nothing matches that/)).toBeVisible()

  await page.getByLabel('Search clips').fill('')
  await page.getByRole('button', { name: 'Lesson one', exact: true }).click()
  // The four published clips share a playlist; the seeded ones do not.
  await expect(page.locator('.grid-cards .card')).toHaveCount(4)

  await page.getByRole('button', { name: 'interview', exact: true }).click()
  await expect(page.locator('.grid-cards .card')).toHaveCount(4)
})


/**
 * Scoring is a poll that runs for seconds, and the screen used to let a learner
 * start another recording straight through it. The abandoned take's score then
 * arrived mid-recording and sat under the new waveform: "Measuring your pitch…"
 * and a number from a take they had already thrown away, on screen at once, with
 * "See analysis" pointing at it.
 */
test('a new recording cannot be started while the last one is being scored', async ({ page }) => {
  await publishLesson(page)
  await asLearner(page)
  await practise(page, LINE(1))

  await recordOnce(page, 'Record')
  await expect(page.getByText('Measuring your pitch…')).toBeVisible({ timeout: 5_000 })

  // Stopping is always allowed; starting waits for an answer about the last take.
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeDisabled()
  // And nothing claims to have a score while it is still being measured.
  await expect(page.locator('.card', { hasText: 'PITCH MATCH SCORE' })).toHaveCount(0)

  // It comes back as soon as there is an answer.
  expect(await scoreOf(page)).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: 'Re-record', exact: true })).toBeEnabled()
})

/**
 * The same race from the other side: moving on while a take is still scoring.
 * The poll cannot be cancelled, so the guard is that a late answer is dropped
 * rather than attached to whatever the learner is looking at now.
 */
test('a take still being scored does not follow the learner to the next line', async ({ page }) => {
  await publishLesson(page)
  await asLearner(page)
  await practise(page, LINE(1))

  await recordOnce(page, 'Record')
  await expect(page.getByText('Measuring your pitch…')).toBeVisible({ timeout: 5_000 })
  await page.getByRole('button', { name: 'Reset mic' }).click()

  // Long enough for the abandoned poll to have finished and tried to report.
  await page.waitForTimeout(8_000)
  await expect(page.locator('.card', { hasText: 'PITCH MATCH SCORE' })).toHaveCount(0)
  await expect(page.getByText('Measuring your pitch…')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeEnabled()
})
