# testreel

[![npm version](https://img.shields.io/npm/v/testreel)](https://www.npmjs.com/package/testreel)
[![CI](https://github.com/greentfrapp/testreel/actions/workflows/ci.yml/badge.svg)](https://github.com/greentfrapp/testreel/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/testreel)](https://github.com/greentfrapp/testreel/blob/main/LICENSE)

Programmatic video recordings for web apps. Define interactions in JSON, get polished screen recordings out.

[demo-2026-04-06_15-16-51-305.webm](https://github.com/user-attachments/assets/15778b3e-af98-4fe7-b18f-c4308d00e353)

*Demo video generated with testreel*

## Install

```bash
npm install testreel playwright
npx playwright install chromium
```

## Quick start

Create a recording definition (`recording.json`):

```json
{
  "url": "https://example.com",
  "viewport": { "width": 1280, "height": 720 },
  "steps": [
    { "action": "click", "selector": "button.sign-in" },
    { "action": "fill", "selector": "#email", "text": "user@example.com" },
    { "action": "screenshot", "name": "filled-form" },
    { "action": "click", "selector": "button[type=submit]" },
    { "action": "wait", "ms": 2000 }
  ]
}
```

Run it:

```bash
npx testreel recording.json
```

Output goes to `./testreel-output/` — a WebM video, PNG screenshots, and an `output.json` manifest.

### CLI

```bash
npx testreel recording.json                       # basic recording
npx testreel recording.json --headed              # visible browser
npx testreel recording.json --format gif          # GIF output
npx testreel recording.json --setup login.json    # separate setup file
npx testreel validate recording.json              # validate without recording
npx testreel login https://app.com --save-state state.json  # interactive login
npx testreel init                                 # create a definition interactively
```

### API

```js
import { record, loadDefinition } from 'testreel'

const def = loadDefinition('recording.json')
const result = await record(def, { outputDir: './output' })

console.log(result.video)       // path to .webm file
console.log(result.screenshots) // array of .png paths
```

### Playwright test fixture

Already have a Playwright test suite? Add recording to any test — just change `test` to `recorded`:

```js
import { test, expect } from '@playwright/test'
import { testreelFixtures, type TestreelFixtures } from 'testreel/playwright'

const recorded = test.extend<TestreelFixtures>({
  ...testreelFixtures,
})

// This test is unchanged — no recording
test('health check', async ({ page }) => {
  await page.goto('/health')
  await expect(page.locator('.status')).toHaveText('OK')
})

// Just swap test → recorded — video is attached to the test report automatically
recorded('product demo', async ({ page }) => {
  await page.goto('https://myapp.com')
  await page.click('.login-button')
  await page.fill('#email', 'user@example.com')
})
```

Recordings are captured regardless of test outcome — partial videos are attached to the report for debugging. See [Playwright Integration](docs/playwright.md) for composing with custom fixtures, the `PageRecorder` API, and configuration options.

### recordPage API

For manual control over recording within any Playwright script:

```js
import { recordPage } from 'testreel'

// page must belong to a context created with recordVideo
const recorder = await recordPage(page, { chrome: true })
await recorder.click('.button')
await recorder.type('#search', 'hello')
const result = await recorder.stop() // finalizes video + post-processing
console.log(result.video)
```

## Features

- **13 actions** — click, type, fill, clear, select, scroll, hover, keyboard, navigate, screenshot, zoom, wait, waitForNetwork
- **Animated cursor** — configurable style, size, and click ripple effects
- **Window chrome** — macOS-style title bar with traffic lights
- **Background styling** — padding, rounded corners, solid or gradient backgrounds
- **Multiple auth methods** — setup blocks, localStorage/cookies injection, storage state files, interactive login, Supabase provider
- **Playwright integration** — test fixture and `recordPage()` API for existing test suites
- **Output formats** — WebM (default), MP4, GIF
- **Speed control** — global and per-step playback speed
- **Environment variables** — `${VAR}` substitution in definitions
- **JSON Schema** — IDE autocomplete via `recording-definition.schema.json`

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | Installation, first recording, output explanation |
| [Recording Definitions](docs/recording-definitions.md) | Full reference for the JSON format |
| [Actions](docs/actions.md) | All 13 step actions with examples |
| [Authentication](docs/authentication.md) | Recording authenticated apps |
| [CLI Reference](docs/cli.md) | All commands and flags |
| [Playwright Integration](docs/playwright.md) | Test fixture and `recordPage()` API |
| [Examples](docs/examples.md) | Common recording patterns |

## License

[MIT](LICENSE)
