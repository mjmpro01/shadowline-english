import { expect, test } from '@playwright/test'
import { asLearner, startFresh } from './session'
import { publishLesson } from './seed'

/**
 * Taking things away.
 *
 * Every delete here removes objects as well as rows — a recording, a video, a
 * whole episode's worth of both — so each one goes through a dialog that says
 * what is about to go rather than asking "are you sure?" about a noun.
 */

test.beforeEach(async ({ page }) => {
  await startFresh(page)
  await publishLesson(page)
  await asLearner(page)
})

async function recordOne(page: import('@playwright/test').Page) {
  await page.goto('/library')
  await page.getByLabel('Search the library').fill('Shadow this line 1')
  await page.getByRole('button', { name: 'Practice', exact: true }).first().click()
  await page.waitForURL('**/practice')
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await page.waitForTimeout(2600)
  const stop = page.getByRole('button', { name: 'Stop' })
  if (await stop.isVisible()) await stop.click()
  await expect(page.getByText('Take recorded').or(page.getByText('PITCH MATCH SCORE'))).toBeVisible({
    timeout: 30_000,
  })
}

test('a learner can throw away a recording they are not happy with', async ({ page }) => {
  // It sits in their history, on the chart, and in the average the
  // leaderboard reads. The server has always allowed this.
  await recordOne(page)
  await page.getByRole('button', { name: 'See analysis' }).click()
  await page.waitForURL(/\/library\/[^/]+$/)
  await expect(page.locator('.seg-opt')).toHaveCount(1)

  await page.getByRole('button', { name: 'Delete this take' }).click()
  await expect(page.getByText(/The recording and its score go for good/)).toBeVisible()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.locator('.seg-opt')).toHaveCount(0)

  // And it is gone from the numbers, not just from this screen: with no take
  // left, the dashboard is back to a learner's first step.
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Start your journey' })).toBeVisible()
  await expect(page.locator('.stat-tile')).toHaveCount(0)
})

test('cancelling keeps the recording', async ({ page }) => {
  await recordOne(page)
  await page.getByRole('button', { name: 'See analysis' }).click()
  await page.waitForURL(/\/library\/[^/]+$/)

  await page.getByRole('button', { name: 'Delete this take' }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('.seg-opt')).toHaveCount(1)
})

test('the app can be installed to a phone', async ({ page }) => {
  // Not an offline app — the clips, the takes and the scores all live on the
  // server. What this buys is a home-screen icon and a window with no browser
  // chrome, which is most of what "an app" means to somebody practising on the
  // way to work.
  await page.goto('/library')

  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel=manifest]')
    if (!link) return null
    const res = await fetch(link.href)
    return { ok: res.ok, body: (await res.json()) as Record<string, unknown> }
  })

  expect(manifest?.ok).toBe(true)
  expect(manifest?.body.display).toBe('standalone')
  expect(manifest?.body.start_url).toBe('/dashboard')
  expect((manifest?.body.icons as { src: string }[]).length).toBeGreaterThanOrEqual(2)

  // Content type, not just status: the dev server answers an unknown path with
  // index.html and a 200, so a missing icon would pass a status check while
  // being an HTML page.
  const icons = (manifest?.body.icons as { src: string }[]).map((icon) => icon.src)
  const links = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLLinkElement>('link[rel=icon], link[rel=apple-touch-icon]')].map(
      (link) => new URL(link.href).pathname,
    ),
  )
  expect(links.length).toBeGreaterThanOrEqual(2)

  for (const src of [...icons, ...links]) {
    const res = await page.request.get(src)
    expect(res.status(), src).toBe(200)
    expect(res.headers()['content-type'], src).toContain('image/')
  }
})
