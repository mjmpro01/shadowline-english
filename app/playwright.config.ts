import { defineConfig } from '@playwright/test'
import { USER_TAKE, writeAudioFixtures } from './e2e/fixtures'

writeAudioFixtures()

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
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
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
