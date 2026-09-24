import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The e2e specs are Playwright's, not Vitest's.
    include: ['test/**/*.test.ts'],
  },
})
