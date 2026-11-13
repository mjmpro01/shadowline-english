import { expect, test } from '@playwright/test'
import { SFTP_PORT } from '../environment'
import { asAdmin, resetServer } from '../session'

/**
 * Setting up the file server videos are imported from, against a real SFTP
 * server (server/cmd/sftp-fixture): its key trusted before anything else, the
 * test showing each step, and the password kept but never shown again.
 */

test.beforeEach(async ({ page }) => {
  await resetServer(page)
  await asAdmin(page)
})

test('an SFTP server is tested, trusted and saved, its password kept out of sight', async ({ page }) => {
  await page.goto('/admin/import')
  const form = page.getByRole('form', { name: 'Auto import' })
  await expect(form.getByRole('radio', { name: 'SFTP (over SSH)' })).toBeChecked()
  await expect(form.getByLabel('Port', { exact: true })).toHaveValue('22')
  await form.getByLabel('Host', { exact: true }).fill('127.0.0.1')
  await form.getByLabel('Port', { exact: true }).fill(String(SFTP_PORT))
  await form.getByLabel('Username', { exact: true }).fill('shadow')
  await form.locator('input[type="password"]').fill('wrong')

  // The server's key first: nothing is sent to it before that is trusted.
  await form.getByRole('button', { name: 'Test the connection' }).click()
  const report = page.getByTestId('import-report')
  await expect(report).toContainText('This server’s host key is not trusted yet.')
  const offered = (await page.getByTestId('offered-key').textContent()) ?? ''
  expect(offered).toMatch(/^SHA256:/)
  await report.getByRole('button', { name: 'Trust this server' }).click()
  await expect(page.getByTestId('host-key')).toHaveText(offered)

  // A wrong password says so; the right one gets through to the inbox.
  await form.getByRole('button', { name: 'Test the connection' }).click()
  await expect(report).toContainText('The server turned the sign-in down')
  await form.locator('input[type="password"]').fill('line-of-sight')
  await form.getByRole('button', { name: 'Test the connection' }).click()
  await expect(report).toContainText('Everything works.')
  await expect(report).toContainText('2 videos are waiting in the inbox.')
  await expect(report).toContainText('/inbox/Friends S1/Episode_01.mp4 → Friends S1')
  await expect(report).toContainText('/inbox/loose.mov → Imported')

  await form.getByLabel('Default series', { exact: true }).fill('From the server')
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form.getByText('Saved. The importer uses it from its next look.')).toBeVisible()

  // Back again: everything as saved, the password only as "saved".
  await page.reload()
  await expect(form.getByLabel('Host', { exact: true })).toHaveValue('127.0.0.1')
  await expect(form.getByLabel('Default series', { exact: true })).toHaveValue('From the server')
  await expect(form.locator('input[type="password"]')).toHaveValue('')
  await expect(form.locator('input[type="password"]')).toHaveAttribute('placeholder', 'Saved. Leave empty to keep it.')
  await expect(page.getByTestId('host-key')).toHaveText(offered)
  // The saved password still signs in.
  await form.getByRole('button', { name: 'Test the connection' }).click()
  await expect(report).toContainText('Everything works.')
})

test('FTPS asks for its TLS mode, and the port follows it', async ({ page }) => {
  await page.goto('/admin/import')
  const form = page.getByRole('form', { name: 'Auto import' })
  await form.getByRole('radio', { name: 'FTPS (FTP over TLS)' }).check()
  await expect(form.getByLabel('Port', { exact: true })).toHaveValue('21')
  await form.getByLabel('TLS', { exact: true }).selectOption('implicit')
  await expect(form.getByLabel('Port', { exact: true })).toHaveValue('990')
  await expect(form.getByRole('radiogroup', { name: 'Sign in with' })).toHaveCount(0)
  await expect(form.getByText('Trusted host key')).toHaveCount(0)

  // Nothing listening there: said plainly.
  await form.getByLabel('Host', { exact: true }).fill('127.0.0.1')
  await form.getByLabel('Port', { exact: true }).fill('1')
  await form.getByLabel('Username', { exact: true }).fill('someone')
  await form.locator('input[type="password"]').fill('x')
  await form.getByRole('button', { name: 'Test the connection' }).click()
  await expect(page.getByTestId('import-report')).toContainText('Cannot reach the server')
})
