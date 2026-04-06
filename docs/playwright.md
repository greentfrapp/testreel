# Playwright Integration

Testreel integrates with Playwright in three ways:

1. **`page` fixture** (`testreel/playwright`) — drop-in recording for existing tests. Your test body stays unchanged — just use a different `test` function and testreel records video automatically
2. **`testreelPage` fixture** (`testreel/playwright`) — advanced recording with animated cursor, zoom, smooth scroll, and other visual effects via the `PageRecorder` API
3. **`recordPage()` API** (`testreel`) — wrap any existing Playwright `Page` with cursor tracking and post-processing in a custom script

## Test fixture

### Setup

Install testreel alongside your existing Playwright setup:

```bash
npm install testreel
```

The `testreel/playwright` entry point exports:

- **`testreelFixtures`** (lowercase) — the fixtures object to spread into `test.extend()`
- **`TestreelFixtures`** (PascalCase) — the TypeScript type for the generic parameter
- **`test`** — a pre-composed test function with testreel fixtures already applied (simpler alternative if you don't need custom fixtures)

### Basic usage

Compose testreel's fixtures into your test and swap `test` for `recorded` on any test you want to capture:

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
  await page.click('.sign-up')
  await page.fill('#email', 'user@example.com')
  await page.fill('#password', 's3cure-password')
  await page.click('button[type=submit]')
  await page.waitForTimeout(2000)
})
```

The `page` fixture creates a recording-enabled browser context that preserves your project's Playwright config (storageState, locale, extraHTTPHeaders, etc.). On teardown it finalizes the video and attaches it to the test report.

Recordings are captured regardless of test outcome — if a test fails, the partial video is still attached to the report for debugging.

### Composing with custom fixtures

Most real projects already have custom fixtures (auth, database, feature flags, etc.). Spread `testreelFixtures` alongside your own:

```ts
import { test as base, expect } from '@playwright/test'
import { testreelFixtures, type TestreelFixtures } from 'testreel/playwright'

type AuthFixtures = {
  authedPage: Page
}

// Combine testreel fixtures with your own
const test = base.extend<TestreelFixtures & AuthFixtures>({
  ...testreelFixtures,

  authedPage: async ({ page, storageState }, use) => {
    // Your auth setup — `page` is already testreel's recording-enabled page
    await page.goto('/login')
    await page.fill('#email', 'test@example.com')
    await page.click('button[type=submit]')
    await use(page)
  },
})

const recorded = test

recorded('dashboard walkthrough', async ({ authedPage, testreelPage }) => {
  // authedPage is the recording-enabled page with your auth applied
  await testreelPage.click('.nav-dashboard')
  await testreelPage.screenshot('dashboard')

  // For standard Playwright assertions, use testreelPage.page
  await expect(testreelPage.page).toHaveURL('/dashboard')
})
```

**How `page`, `testreelPage`, and custom fixtures interact:**

- **`page`** — testreel overrides Playwright's default `page` to enable video recording. Any fixture that depends on `page` (like `authedPage` above) automatically gets the recording-enabled page.
- **`testreelPage`** — wraps `page` with the `PageRecorder` API for visual effects (animated cursor, zoom, smooth scroll). Access the underlying Playwright `Page` via `testreelPage.page` for assertions like `expect(page).toHaveURL(...)`.
- **Custom fixtures** — work exactly as before. Because they receive testreel's `page`, their actions are included in the recording.

### Advanced: PageRecorder

For polished demo recordings with animated cursor, zoom effects, and smooth scrolling, use the `testreelPage` fixture instead:

```js
recorded('polished demo', async ({ testreelPage }) => {
  await testreelPage.navigate('https://myapp.com')
  await testreelPage.click('.feature-button')
  await testreelPage.zoom({ selector: '.hero', scale: 2.5, duration: 800 })
  await testreelPage.wait(1500)
  await testreelPage.screenshot('zoomed')
  await testreelPage.zoom({ scale: 1, duration: 600 })
})
```

The `testreelPage` object provides these methods:

| Method | Description |
|--------|-------------|
| `click(selector, options?)` | Click an element with animated cursor. Options: `{ timeout, zoom, zoomOut }` |
| `type(selector, text, options?)` | Type text with animated cursor. Options: `{ delay, clear, timeout }` |
| `fill(selector, text, options?)` | Set an input's value directly. Options: `{ timeout }` |
| `hover(selector, options?)` | Hover with animated cursor. Options: `{ timeout }` |
| `scroll(options?)` | Smooth scroll with easing. Options: `{ x, y, scrollSpeed }` |
| `zoom(options)` | Zoom to a target. Options: `{ selector, scale, x, y, duration }` |
| `screenshot(name?)` | Take a named screenshot |
| `keyboard(key)` | Press a keyboard key |
| `navigate(url)` | Navigate to a URL |
| `wait(ms?)` | Wait for a duration (default: 1000ms) |
| `stop()` | Stop recording and run post-processing (called automatically by the fixture) |

All selector-based actions include cursor movement and click ripple effects by default.

### Configuring options

Pass options via `playwright.config.ts` using the `testreelOptions` fixture:

```js
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  use: {
    testreelOptions: {
      viewport: { width: 1280, height: 720 },
      chrome: { url: true },
      background: {
        gradient: { from: '#667eea', to: '#764ba2' },
        padding: 60,
        borderRadius: 12,
      },
      cursor: { style: 'pointer' }, // or 'touch' for mobile UI recordings
      outputFormat: 'webm',
    },
  },
})
```

Or override per-test:

```js
recorded.use({
  testreelOptions: {
    chrome: false,
    background: false,
  },
})

recorded('lightweight recording', async ({ page }) => {
  // ...
})
```

### Performance

Recording adds overhead in two areas:

- **During the test** — an extra browser context with video capture enabled. This is lightweight but not free.
- **After the test** — FFmpeg post-processing runs on teardown to overlay the cursor, add window chrome, apply background styling, and adjust playback speed. Processing time scales with video length and the number of enabled effects.

For most projects, record selectively — key user flows or demo-worthy tests — rather than the entire suite. You can disable expensive effects per-test with `testreelOptions`:

```js
recorded.use({
  testreelOptions: { cursor: false, chrome: false, background: false },
})
```

## recordPage API

For scripts outside of Playwright Test, or when you need full control over the browser lifecycle:

```js
import { chromium } from 'playwright-core'
import { recordPage } from 'testreel'

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: {
    dir: './output',
    size: { width: 1280, height: 720 },
  },
})
const page = await context.newPage()
await page.goto('https://myapp.com')

const recorder = await recordPage(page, {
  outputDir: './output',
  chrome: { url: 'https://myapp.com' },
  background: { color: '#6366f1', padding: 60 },
})

await recorder.click('.feature-button')
await recorder.type('#search', 'hello world')
await recorder.screenshot('search-results')

const result = await recorder.stop()
console.log(result.video)       // path to processed .webm
console.log(result.screenshots) // array of screenshot paths

await browser.close()
```

### Important: context lifecycle

`stop()` closes the browser **context** (not the browser) to finalize the video. The page is unusable after `stop()`. If you need to continue using the browser, create a new context.

Calling `stop()` twice throws an error.

## RecordPageOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `outputDir` | `string` | `'./testreel-output'` | Directory for output files |
| `cursor` | `boolean \| CursorOptions` | `true` | Animated cursor overlay |
| `chrome` | `boolean \| WindowChromeOptions` | `false` | macOS-style window chrome |
| `background` | `boolean \| BackgroundOptions` | `false` | Background padding and styling |
| `speed` | `number` | `1.0` | Playback speed multiplier |
| `outputFormat` | `'webm' \| 'mp4' \| 'gif'` | `'webm'` | Video output format |
| `keepIntermediates` | `boolean` | `false` | Keep cursor JSON and intermediate files |

See [Recording Definitions](recording-definitions.md) for details on cursor, chrome, and background options.
