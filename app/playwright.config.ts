import { defineConfig } from '@playwright/test'
import {
  ADMIN_DIR,
  ADMIN_PORT,
  ADMIN_URL,
  API_URL,
  APP_PORT,
  APP_URL,
  SERVER_DIR,
  serverEnv,
} from './e2e/environment'
import { USER_TAKE, writeAudioFixtures } from './e2e/fixtures'
import { provision } from './e2e/provision'

writeAudioFixtures()
provision()

export default defineConfig({
  testMatch: '**/*.spec.ts',
  /**
   * Two apps, one stack.
   *
   * The console is a separate build with its own dev server, but there is one
   * API, one database and one set of workers to test either of them against, so
   * there is one browser-test run. The specs are split by which app they drive;
   * `baseURL` is what says which.
   */
  projects: [
    { name: 'app', testDir: './e2e', testIgnore: '**/console/**' },
    { name: 'console', testDir: './e2e/console', use: { baseURL: ADMIN_URL } },
  ],
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
    {
      // The console reaches the API through its own Vite proxy rather than
      // across origins, which is what nginx does for it in production and the
      // reason it needs no CORS allowance of its own.
      command: `npm run dev -- --port ${ADMIN_PORT} --strictPort`,
      cwd: ADMIN_DIR,
      env: { ...process.env, ADMIN_API_URL: API_URL } as Record<string, string>,
      url: `${ADMIN_URL}/admin/`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})

