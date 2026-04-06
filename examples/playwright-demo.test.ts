/**
 * Sample Playwright test that produces polished screen recordings using testreel.
 *
 * Run from the testreel package directory:
 *   cd testreel
 *   pnpm exec playwright test --config examples/playwright.config.ts playwright-demo
 *
 * Or via the package script:
 *   pnpm test:examples
 *
 * Output:
 *   Videos and screenshots are attached to the Playwright HTML report.
 *   Open it with: pnpm exec playwright show-report
 */

import { test as base } from '@playwright/test'
import { testreelFixtures, type TestreelFixtures } from 'testreel/playwright'

const recorded = base.extend<TestreelFixtures>({
  ...testreelFixtures,
})

// ── Global options for all recorded tests in this file ─────────────────
recorded.use({
  testreelOptions: {
    viewport: { width: 1280, height: 720 },
    chrome: { url: true },
    background: {
      gradient: { from: '#667eea', to: '#764ba2' },
      padding: 60,
      borderRadius: 12,
    },
  },
})

// ── Tests ──────────────────────────────────────────────────────────────

recorded('TodoMVC — manage completed todos', async ({ testreelPage }) => {
  await testreelPage.navigate('https://demo.playwright.dev/todomvc')
  await testreelPage.wait(1000)

  // Add a few todos
  await testreelPage.type('.new-todo', 'Buy groceries')
  await testreelPage.keyboard('Enter')
  await testreelPage.type('.new-todo', 'Walk the dog')
  await testreelPage.keyboard('Enter')
  await testreelPage.type('.new-todo', 'Read a book')
  await testreelPage.keyboard('Enter')
  await testreelPage.wait(500)

  // Complete two todos
  await testreelPage.click('.todo-list li:nth-child(1) .toggle')
  await testreelPage.click('.todo-list li:nth-child(3) .toggle')
  await testreelPage.wait(500)

  // Filter to completed and clear them
  await testreelPage.click('.filters a[href="#/completed"]', { zoom: 1.5 })
  await testreelPage.wait(500)
  await testreelPage.click('.clear-completed', { zoom: 2 })
  await testreelPage.wait(500)

  // Filter back to all todos
  await testreelPage.click('.filters a[href="#/"]', { zoom: 1.5 })
  await testreelPage.wait(500)

  // Delete the remaining todo
  await testreelPage.hover('.todo-list li:first-child')
  await testreelPage.click('.todo-list li:first-child .destroy', { zoom: 2 })
  await testreelPage.wait(1000)
})
