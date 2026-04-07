# Getting Started

## Install

```bash
npm install testreel playwright
```

Testreel uses Playwright to drive a real Chromium browser. After installing, make sure Chromium is available:

```bash
npx playwright install chromium
```

## Your first recording

Create a file called `recording.json`:

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

Run it:

```bash
npx testreel recording.json
```

Testreel will launch a headless browser, navigate to the URL, execute each step, and write the output to `./testreel-output/`.

## What gets produced

After a recording completes, the output directory contains:

| File | Description |
|------|-------------|
| `recording-<timestamp>.webm` | The screen recording video |
| `homepage.png`, `scrolled.png` | Screenshots from `screenshot` steps |
| `final-<timestamp>.png` | Automatic screenshot of the last frame |
| `output.json` | Manifest with paths to all output files |

## Debugging with headed mode

To watch the recording happen in a visible browser window:

```bash
npx testreel recording.json --headed
```

## Validate without recording

Check that your definition is valid without launching a browser:

```bash
npx testreel recording.json --dry-run
# or
npx testreel validate recording.json
```

## Recording from Playwright tests

If you already have a Playwright test suite, you can add video recording with minimal changes — just compose testreel's fixtures and swap `test` for `recorded`:

```js
import { test } from '@playwright/test'
import { testreelFixtures, type TestreelFixtures } from 'testreel/playwright'

const recorded = test.extend<TestreelFixtures>({
  ...testreelFixtures,
})

recorded('onboarding flow', async ({ page }) => {
  await page.goto('https://myapp.com')
  await page.click('.get-started')
  await page.fill('#name', 'Jane Smith')
  // Video is saved and attached to the test report automatically
})
```

See the [Playwright Integration](playwright.md) guide for full details.

## Using the API

### From a definition

```js
import { record, loadDefinition } from 'testreel'

const def = loadDefinition('recording.json')
const result = await record(def, { outputDir: './output' })

console.log(result.video)       // path to .webm file
console.log(result.screenshots) // array of .png paths
```

### Recording a page directly

For manual control over an existing Playwright page, use `recordPage()`:

```js
import { recordPage } from 'testreel'

// page must belong to a context created with recordVideo
const recorder = await recordPage(page, { chrome: true })
await recorder.click('.button')
const result = await recorder.stop()
console.log(result.video)
```

## Next steps

- [Recording Definitions](recording-definitions.md) — full reference for the JSON format
- [Actions](actions.md) — all 13 step actions with examples
- [Authentication](authentication.md) — recording authenticated apps
- [CLI Reference](cli.md) — all commands and flags
- [Playwright Integration](playwright.md) — test fixture and `recordPage()` API
- [Examples](examples.md) — common recording patterns
