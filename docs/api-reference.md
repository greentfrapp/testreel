# API Reference

Complete reference for all exports from `testreel` and `testreel/playwright`.

## `testreel` — Main Package

### `record(input, options?)`

Record a video from a recording definition.

```ts
import { record } from 'testreel'

const result = await record('definition.yaml')
// or pass inline:
const result = await record({ url: 'https://example.com', steps: [...] })
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `RecordingDefinition \| string` | A definition object, or path to a JSON/JSONC/YAML file |
| `options.outputDir` | `string` | Output directory. Default: `'./testreel-output'` |
| `options.headless` | `boolean` | Run browser headlessly. Default: `true` |
| `options.setup` | `SetupBlock` | Override the definition's setup block |
| `options.speed` | `number` | Override playback speed multiplier |
| `options.outputFormat` | `'webm' \| 'mp4' \| 'gif'` | Override output format |
| `options.keepIntermediates` | `boolean` | Keep cursor JSON and intermediate files |
| `options.clean` | `boolean` | Remove previous output files before recording |

**Returns:** `Promise<RecordingResult>`

```ts
interface RecordingResult {
  video?: string        // Path to the output video file
  screenshots: string[] // Paths to any screenshots taken
  cursorEvents?: string // Path to cursor events JSON (if keepIntermediates)
  manifest?: string     // Path to output.json manifest
}
```

---

### `recordPage(page, options?)`

Lower-level API for recording an existing Playwright page. Returns a `PageRecorder` with methods for cursor-animated interactions.

```ts
import { recordPage } from 'testreel'

const recorder = await recordPage(page, {
  cursor: true,
  chrome: { url: true },
  background: { gradient: { from: '#667eea', to: '#764ba2' } },
})

await recorder.click('.button')
await recorder.type('input', 'Hello')
const result = await recorder.stop()
```

**Requirements:** The page must have video recording enabled (`recordVideo` in context options) and a viewport set.

**Options (`RecordPageOptions`):**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `outputDir` | `string` | `'./testreel-output'` | Output directory |
| `name` | `string` | timestamp | Base name for output files. Produces stable filenames that overwrite on re-run |
| `cursor` | `boolean \| CursorOptions` | `true` | Animated cursor overlay |
| `chrome` | `boolean \| WindowChromeOptions` | `false` | macOS-style window chrome |
| `background` | `boolean \| BackgroundOptions` | `false` | Background padding and styling |
| `speed` | `number` | `1.0` | Playback speed multiplier |
| `outputFormat` | `'webm' \| 'mp4' \| 'gif'` | `'webm'` | Output video format |
| `keepIntermediates` | `boolean` | `false` | Keep intermediate files |
| `clean` | `boolean` | `false` | Remove previous output files before recording |

**Returns:** `Promise<PageRecorder>`

---

### `PageRecorder`

Returned by `recordPage()`. Provides cursor-animated interaction methods.

| Method | Signature | Description |
|--------|-----------|-------------|
| `click` | `(selector, options?) => Promise<void>` | Click with animated cursor + ripple. Options: `{ timeout, zoom, zoomOut }` |
| `type` | `(selector, text, options?) => Promise<void>` | Type character-by-character (delay: 80ms default, clear: select-all first) |
| `fill` | `(selector, text, options?) => Promise<void>` | Set input value instantly (no animation) |
| `hover` | `(selector, options?) => Promise<void>` | Move cursor to element without clicking |
| `scroll` | `(options?) => Promise<void>` | Smooth-scroll by pixel offsets (x, y, scrollSpeed) |
| `zoom` | `(options) => Promise<void>` | CSS transform zoom (selector or x/y, scale, duration) |
| `screenshot` | `(name?) => Promise<string>` | Capture PNG screenshot, returns file path |
| `keyboard` | `(key) => Promise<void>` | Press a key (e.g., 'Enter', 'Tab') |
| `navigate` | `(url) => Promise<void>` | Navigate to URL |
| `wait` | `(ms?) => Promise<void>` | Pause recording (default 1000ms) |
| `stop` | `() => Promise<RecordingResult>` | Stop recording and run post-processing. Closes the browser context |
| `page` | `readonly Page` | The underlying Playwright page (unusable after stop) |

All methods accepting a `selector` also accept a Playwright `Locator` (`SelectorOrLocator = string | Locator`).

---

### `loadDefinition(input)`

Load and validate a recording definition from a file path or inline object. Supports JSON, JSONC (with comments), and YAML. Performs `${ENV_VAR}` substitution on all string values.

```ts
import { loadDefinition } from 'testreel'

const def = loadDefinition('path/to/definition.yaml')
const def = loadDefinition({ url: '...', steps: [...] })
```

**Returns:** `RecordingDefinition`

---

### `loadSetup(input)`

Load a setup block from a file or inline object.

```ts
import { loadSetup } from 'testreel'
const setup = loadSetup('setup.yaml')
```

**Returns:** `SetupBlock`

---

### `resolveAuth(config)`

Resolve an auth provider configuration into injectable credentials (localStorage, cookies, headers).

```ts
import { resolveAuth } from 'testreel'

const auth = await resolveAuth({
  provider: 'supabase',
  url: 'https://xxx.supabase.co',
  serviceRoleKey: '...',
  email: 'user@example.com',
})
// auth.localStorage, auth.cookies, auth.headers
```

**Returns:** `Promise<AuthResult>`

---

### `login(options)`

Open an interactive browser session for manual login. Saves the session state for reuse in recordings.

```ts
import { login } from 'testreel'

await login({
  url: 'https://app.example.com/login',
  saveState: './auth-state.json',
  channel: 'chrome',  // optional: use Chrome for OAuth
})
```

**Options (`LoginOptions`):**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | **required** | URL to open |
| `saveState` | `string` | **required** | Path to save session state JSON |
| `viewport` | `Viewport` | `1280x720` | Browser viewport |
| `channel` | `string` | — | Browser channel (e.g., 'chrome' for OAuth flows) |
| `cdpUrl` | `string` | — | Connect to existing browser via CDP |
| `remote` | `boolean` | — | Headless with web viewer |
| `port` | `number` | `9222` | Viewer port (when remote) |

---

### Cursor Utilities

```ts
import { createCursorTracker, moveCursorToPoint, hideCursor, showCursor } from 'testreel'
```

| Function | Description |
|----------|-------------|
| `createCursorTracker()` | Create a cursor event tracker for manual recording |
| `moveCursorToPoint(page, x, y, options?)` | Move the cursor overlay to absolute coordinates |
| `hideCursor(page)` | Hide the cursor overlay |
| `showCursor(page)` | Show the cursor overlay |

---

### Logging

```ts
import { setLogLevel, getLogLevel } from 'testreel'

setLogLevel('verbose') // 'quiet' | 'normal' | 'verbose'
```

---

## `testreel/playwright` — Playwright Fixture

### Quick Start

```ts
import { test, expect } from 'testreel/playwright'

test('demo', async ({ testreelPage }) => {
  await testreelPage.navigate('https://example.com')
  await testreelPage.click('.button')
  await testreelPage.stop()
})
```

### Exports

| Export | Type | Description |
|--------|------|-------------|
| `test` | `TestType` | Pre-composed Playwright test with testreel fixtures |
| `testreelFixtures` | `object` | Raw fixtures to compose with `test.extend()` |
| `expect` | `Expect` | Re-exported from `@playwright/test` |

### Types

| Type | Description |
|------|-------------|
| `TestreelFixtures` | Generic parameter for `test.extend<TestreelFixtures>()` |
| `PageRecorder` | Recorder interface (see above) |
| `RecordPageOptions` | Configuration options |
| `SelectorOrLocator` | `string \| Locator` |

### Fixtures

**`page`** — Standard Playwright Page with video recording enabled. Use for setup, assertions, and interactions that don't need cursor animation.

**`testreelPage`** — PageRecorder with animated cursor, click ripples, and post-processing. Use for the visible demo steps.

**`testreelOptions`** — Configuration, set via `test.use()`:

```ts
test.use({
  testreelOptions: {
    viewport: { width: 1280, height: 720 },
    name: 'my-demo',
    cursor: { style: 'pointer' },
    chrome: { url: true },
    background: { gradient: { from: '#667eea', to: '#764ba2' }, padding: 60 },
    outputFormat: 'mp4',
    speed: 1.0,
  },
})
```

### Fixture Composition

Compose testreel fixtures with your own custom fixtures:

```ts
import { test as base } from '@playwright/test'
import { testreelFixtures, type TestreelFixtures } from 'testreel/playwright'

type MyFixtures = TestreelFixtures & { apiClient: ApiClient }

const test = base.extend<MyFixtures>({
  ...testreelFixtures,
  apiClient: async ({}, use) => { /* ... */ },
})
```

---

## Recording Definition Format

See [recording-definitions.md](recording-definitions.md) for the full schema.

### `RecordingDefinition`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | `string` | **required** | Target URL (supports `${ENV_VAR}`) |
| `steps` | `Step[]` | **required** | Non-empty array of actions |
| `viewport` | `{ width, height }` | `1280x720` | Browser viewport |
| `outputSize` | `{ width, height }` | — | Desired final video dimensions. Padding is adjusted so the output matches this size |
| `colorScheme` | `'light' \| 'dark'` | `'light'` | Preferred color scheme |
| `waitForSelector` | `string` | — | Wait before starting steps |
| `speed` | `number` | `1.0` | Global playback speed |
| `outputFormat` | `'webm' \| 'mp4' \| 'gif'` | `'webm'` | Output format |
| `cursor` | `boolean \| CursorOptions` | `true` | Cursor overlay |
| `chrome` | `boolean \| WindowChromeOptions` | `false` | Window chrome |
| `background` | `boolean \| BackgroundOptions` | `false` | Background |
| `setup` | `SetupBlock` | — | Pre-recording steps (not recorded) |
| `storageState` | `string` | — | Playwright storage state path |
| `cookies` | `Cookie[]` | — | Cookies to inject |
| `localStorage` | `Record<string, string>` | — | localStorage entries |
| `headers` | `Record<string, string>` | — | Extra HTTP headers |
| `auth` | `AuthProvider` | — | Auth provider config |

---

## Step Types

All steps share these base properties:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `pauseAfter` | `number` | `500` | Pause after action (ms) |
| `speed` | `number` | — | Per-step playback speed |
| `timeout` | `number` | `5000` | Selector wait timeout (ms) |
| `waitFor` | `string` | — | Selector or `'networkidle'` to wait for before executing |

### `wait`

Pause for a duration. `ms` defaults to `1000`.

### `click`

Click an element with animated cursor and ripple. Requires `selector`.

### `type`

Type text character-by-character. Requires `selector` and `text`. Optional: `delay` (default 80ms), `clear` (select-all first).

### `fill`

Set input value instantly, no animation. Requires `selector` and `text`.

### `clear`

Clear an input field. Requires `selector`.

### `select`

Select a dropdown option. Requires `selector` and `value`.

### `scroll`

Smooth-scroll with easing. Optional: `x`, `y` (pixel deltas), `scrollSpeed` (default 1).

### `hover`

Move cursor to element without clicking. Requires `selector`.

### `keyboard`

Press a keyboard key. Requires `key` (e.g., `'Enter'`, `'Escape'`, `'Tab'`).

### `navigate`

Navigate to a URL. Requires `url` (supports `${ENV_VAR}`).

### `screenshot`

Capture a PNG. Optional: `name` (filename without extension), `fullPage` (default false).

### `zoom`

CSS transform zoom animation. Optional: `selector` (element to center on), `scale` (default 2, set to 1 to reset), `x`/`y` (coordinate-based), `duration` (default 600ms).

### `waitForNetwork`

Wait for a network response. Requires `urlPattern` (URL substring to match).

---

## Visual Options

### `CursorOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable cursor overlay |
| `style` | `'default' \| 'pointer' \| 'text' \| 'touch'` | `'default'` | Cursor image style. `'touch'` shows a centered circle cursor for mobile UIs |
| `size` | `number` | `48` | Cursor size in pixels |
| `color` | `string` | — | Cursor color (hex) |
| `rippleColor` | `string` | `'rgba(0, 0, 0, 0.4)'` | Click ripple color |
| `rippleSize` | `number` | `100` | Ripple radius in pixels. Set to `0` to disable ripples. |
| `transitionMs` | `number` | — | Override cursor movement duration. Omit for speed-based (500 px/s, clamped 100–600 ms). |

### `WindowChromeOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable window chrome |
| `titleBarHeight` | `number` | `38` | Title bar height (px) |
| `titleBarColor` | `string` | `'#e8e8e8'` | Title bar background color |
| `trafficLights` | `boolean` | `true` | Show red/yellow/green buttons |
| `url` | `boolean \| string` | — | Show URL bar (true = recording URL, or custom string) |

### `BackgroundOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable background |
| `color` | `string` | — | Solid background color |
| `gradient` | `{ from, to }` | `{ from: '#6366f1', to: '#a855f7' }` | Diagonal gradient (overrides color). This is the default when neither `color` nor `gradient` is set |
| `padding` | `number` | `60` | Padding around window (px) |
| `borderRadius` | `number` | `12` | Corner radius (px) |

---

## Auth Providers

### Supabase Magic Link

```ts
interface SupabaseAuthProvider {
  provider: 'supabase'
  url: string           // Supabase project URL
  serviceRoleKey: string // Service role key (not anon key)
  email: string          // User email to authenticate as
}
```

### Other Auth Methods

- **Setup block** — run login steps before recording
- **`storageState`** — path to Playwright `.storageState()` JSON
- **`cookies`** — inject cookies directly
- **`localStorage`** — inject key-value pairs
- **`headers`** — send auth headers with every request
- **`testreel login` CLI** — interactive manual login with session capture
