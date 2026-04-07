/**
 * Playwright config for integration tests.
 *
 * Run:
 *   npx playwright test --config tests/integration/playwright.config.ts
 */

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '*.test.ts',
  timeout: 60_000,
  retries: 0,
  reporter: 'html',
  use: {
    headless: true,
  },
})
