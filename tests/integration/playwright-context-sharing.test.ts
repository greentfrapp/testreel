/**
 * Integration test that verifies testreelPage shares the same browser context
 * as the page fixture — not creating its own isolated context.
 *
 * This is critical for fixture composition: route interceptions, addInitScript,
 * localStorage seeding, and other setup applied to `page` must carry over to
 * `testreelPage.page`.
 *
 * Run:
 *   pnpm exec playwright test --config tests/integration/playwright.config.ts playwright-context-sharing
 */

import { test as base, expect } from '@playwright/test'
import {
  testreelFixtures,
  type TestreelFixtures,
} from 'testreel/playwright'

const test = base.extend<TestreelFixtures>(testreelFixtures)

test.use({
  testreelOptions: {
    viewport: { width: 1280, height: 720 },
    cursor: false,
    chrome: false,
    background: false,
  },
})

test('testreelPage.page is the same object as the page fixture', async ({
  page,
  testreelPage,
}) => {
  expect(testreelPage.page).toBe(page)
})

test('testreelPage.page shares the same browser context as page', async ({
  page,
  testreelPage,
}) => {
  expect(testreelPage.page.context()).toBe(page.context())
})

test('route interceptions on page carry over to testreelPage', async ({
  page,
  testreelPage,
}) => {
  // Set up a route interception on the page fixture
  let routeIntercepted = false
  await page.route('**/intercepted', (route) => {
    routeIntercepted = true
    route.fulfill({ status: 200, body: 'intercepted' })
  })

  // Navigate via testreelPage — the route should be active
  await testreelPage.navigate('https://example.com/intercepted')
  expect(routeIntercepted).toBe(true)
})

test('addInitScript on page applies to testreelPage navigation', async ({
  page,
  testreelPage,
}) => {
  // Add an init script via the page fixture
  await page.addInitScript(() => {
    ;(window as any).__testreel_init_script_ran = true
  })

  // Navigate via testreelPage
  await testreelPage.navigate('https://example.com')

  // The init script should have run in the page context
  const result = await testreelPage.page.evaluate(
    () => (window as any).__testreel_init_script_ran,
  )
  expect(result).toBe(true)
})
