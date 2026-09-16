import { defineConfig } from '@playwright/test'
import { API_URL, APP_PORT, APP_URL, SERVER_DIR, serverEnv } from './e2e/environment'
import { USER_TAKE, writeAudioFixtures } from './e2e/fixtures'
import { provision } from './e2e/provision'

writeAudioFixtures()
provision()

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  // The tests share one database and one library, so they run one at a time.
  // Parallelism would need a database per worker, which is not worth it for a
  // suite this size.
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: APP_URL,
    permissions: ['microphone'],
    launchOptions: {
      // Set CHROMIUM_PATH to use a browser already on the machine.
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${USER_TAKE}`,
      ],
    },
  },
  webServer: [
    {
      command: 'go run ./cmd/api',
      cwd: SERVER_DIR,
      env: serverEnv() as Record<string, string>,
      url: `${API_URL}/healthz`,
      // Never reuse: a server left over from another run would be pointed at a
      // different database, and the failures would make no sense.
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `npm run dev -- --port ${APP_PORT} --strictPort`,
      env: { ...process.env, VITE_API_URL: API_URL } as Record<string, string>,
      url: APP_URL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})

