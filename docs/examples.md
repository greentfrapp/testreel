# Examples

Common recording patterns to get you started.

## Simple page walkthrough

Add some todos and check one off:

```json
{
  "url": "https://demo.playwright.dev/todomvc",
  "viewport": { "width": 1280, "height": 720 },
  "steps": [
    { "action": "wait", "ms": 1000 },
    { "action": "type", "selector": ".new-todo", "text": "Buy groceries" },
    { "action": "keyboard", "key": "Enter" },
    { "action": "type", "selector": ".new-todo", "text": "Walk the dog" },
    { "action": "keyboard", "key": "Enter" },
    { "action": "screenshot", "name": "todos-added" },
    { "action": "click", "selector": ".todo-list li:first-child .toggle" },
    { "action": "screenshot", "name": "first-completed" }
  ]
}
```

## Form filling demo

Show a sign-up flow with realistic typing:

```json
{
  "url": "https://app.example.com/signup",
  "viewport": { "width": 1280, "height": 720 },
  "steps": [
    { "action": "wait", "ms": 1000 },
    { "action": "type", "selector": "#name", "text": "Jane Smith", "delay": 60 },
    { "action": "type", "selector": "#email", "text": "jane@example.com", "delay": 60 },
    { "action": "fill", "selector": "#password", "text": "s3cure-password" },
    { "action": "screenshot", "name": "form-filled" },
    { "action": "click", "selector": "button[type=submit]" },
    { "action": "wait", "ms": 2000 },
    { "action": "screenshot", "name": "success" }
  ]
}
```

## Zoom and highlight

Draw attention to a specific part of the page:

```json
{
  "url": "https://example.com",
  "viewport": { "width": 1280, "height": 720 },
  "steps": [
    { "action": "wait", "ms": 1000 },
    { "action": "zoom", "selector": ".feature-card", "scale": 2.5, "duration": 800 },
    { "action": "wait", "ms": 2000 },
    { "action": "screenshot", "name": "zoomed-feature" },
    { "action": "zoom", "scale": 1, "duration": 600 },
    { "action": "wait", "ms": 500 }
  ]
}
```

## Click with zoom

Zoom into each click target for emphasis. Consecutive zoom clicks pan directly without zooming out in between:

```json
{
  "url": "https://demo.playwright.dev/todomvc",
  "viewport": { "width": 1280, "height": 720 },
  "chrome": { "url": true },
  "background": true,
  "steps": [
    { "action": "wait", "ms": 1000 },
    { "action": "click", "selector": ".todo-list li:first-child .toggle", "zoom": 2 },
    { "action": "click", "selector": ".filters a[href='#/active']", "zoom": 1.5 },
    { "action": "click", "selector": ".filters a[href='#/']", "zoom": 1.5 },
    { "action": "wait", "ms": 1000 }
  ]
}
```

## GIF for pull requests

Create a small, lightweight GIF to embed in a PR description:

```json
{
  "url": "https://example.com",
  "viewport": { "width": 800, "height": 600 },
  "outputFormat": "gif",
  "speed": 1.5,
  "steps": [
    { "action": "wait", "ms": 500 },
    { "action": "hover", "selector": ".new-feature" },
    { "action": "click", "selector": ".new-feature" },
    { "action": "wait", "ms": 1000 }
  ]
}
```

## Polished demo with window chrome

Add macOS-style chrome and a gradient background for marketing/docs:

```json
{
  "url": "https://app.example.com",
  "viewport": { "width": 1280, "height": 720 },
  "outputSize": { "width": 1920, "height": 1080 },
  "chrome": { "url": true },
  "background": {
    "gradient": { "from": "#667eea", "to": "#764ba2" },
    "borderRadius": 12
  },
  "outputFormat": "mp4",
  "steps": [
    { "action": "wait", "ms": 1000 },
    { "action": "click", "selector": ".demo-button" },
    { "action": "wait", "ms": 2000 },
    { "action": "screenshot", "name": "hero" }
  ]
}
```

## Fixed output size

Target a specific video resolution (e.g., 1920×1080). Padding is computed automatically to fill the gap between the viewport and the desired size:

```json
{
  "url": "https://app.example.com",
  "viewport": { "width": 1280, "height": 720 },
  "outputSize": { "width": 1920, "height": 1080 },
  "chrome": { "url": true },
  "background": {
    "gradient": { "from": "#667eea", "to": "#764ba2" },
    "borderRadius": 12
  },
  "steps": [
    { "action": "wait", "ms": 1000 },
    { "action": "click", "selector": ".demo-button" },
    { "action": "wait", "ms": 2000 }
  ]
}
```

The `padding` in `background` acts as a minimum — if the viewport is small enough, padding increases to fill the target size. If the viewport is too large, the window is scaled down to fit while preserving aspect ratio.

## Authenticated app recording

Record a dashboard that requires login, using a setup block:

```json
{
  "url": "https://app.example.com/dashboard",
  "viewport": { "width": 1280, "height": 720 },
  "setup": {
    "url": "https://app.example.com/login",
    "steps": [
      { "action": "fill", "selector": "#email", "text": "${TEST_USER_EMAIL}" },
      { "action": "fill", "selector": "#password", "text": "${TEST_USER_PASSWORD}" },
      { "action": "click", "selector": "button[type=submit]" },
      { "action": "wait", "ms": 3000 }
    ]
  },
  "steps": [
    { "action": "wait", "ms": 1000 },
    { "action": "screenshot", "name": "dashboard" },
    { "action": "click", "selector": "[data-tab=analytics]" },
    { "action": "wait", "ms": 2000 },
    { "action": "screenshot", "name": "analytics" }
  ]
}
```

## Wait for async content

Wait for an API response before interacting:

```json
{
  "url": "https://app.example.com/reports",
  "steps": [
    { "action": "click", "selector": "button.load-report" },
    { "action": "waitForNetwork", "urlPattern": "/api/reports" },
    { "action": "screenshot", "name": "report-loaded" },
    { "action": "zoom", "selector": ".chart", "scale": 2 },
    { "action": "wait", "ms": 2000 },
    { "action": "screenshot", "name": "chart-zoomed" }
  ]
}
```

## Using environment variables

Keep secrets out of your definition files:

```json
{
  "url": "https://${APP_HOST}/dashboard",
  "localStorage": {
    "auth-token": "${AUTH_TOKEN}"
  },
  "steps": [
    { "action": "wait", "ms": 2000 },
    { "action": "screenshot", "name": "dashboard" }
  ]
}
```

```bash
APP_HOST=staging.example.com AUTH_TOKEN=eyJ... npx testreel recording.json
```

## Recording a Playwright test

Add recording to existing tests — compose testreel's fixtures and swap `test` for `recorded`:

```js
import { test } from '@playwright/test'
import { testreelFixtures, type TestreelFixtures } from 'testreel/playwright'

const recorded = test.extend<TestreelFixtures>({
  ...testreelFixtures,
})

recorded.use({
  testreelOptions: {
    chrome: { url: true },
    background: { gradient: { from: '#667eea', to: '#764ba2' } },
  },
})

recorded('sign-up flow', async ({ page }) => {
  await page.goto('https://app.example.com/signup')
  await page.fill('#name', 'Jane Smith')
  await page.fill('#email', 'jane@example.com')
  await page.fill('#password', 's3cure-password')
  await page.click('button[type=submit]')
  await page.waitForTimeout(2000)
  // Video is saved and attached to the test report automatically
})
```

## Using recordPage in a script

For programmatic recording outside of Playwright Test:

```js
import { chromium } from 'playwright-core'
import { recordPage } from 'testreel'

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: './output', size: { width: 1280, height: 720 } },
})
const page = await context.newPage()
await page.goto('https://app.example.com')

const recorder = await recordPage(page, {
  outputDir: './output',
  chrome: true,
  background: { color: '#6366f1', padding: 60, borderRadius: 12 },
})

await recorder.click('.demo-button')
await recorder.wait(1000)
await recorder.screenshot('demo')

const result = await recorder.stop()
console.log(result.video) // path to processed video

await browser.close()
```
