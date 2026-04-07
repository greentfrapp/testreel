# Recording Definitions

A recording definition is a JSON file that describes what to record: the target URL, browser configuration, and a sequence of steps to execute. Testreel also supports JSONC (JSON with comments) and YAML.

## File formats

| Extension | Format |
|-----------|--------|
| `.json` | Standard JSON |
| `.jsonc` | JSON with `//` and `/* */` comments |
| `.yaml`, `.yml` | YAML |

## Minimal example

Only `url` and `steps` are required:

```json
{
  "url": "https://example.com",
  "steps": [
    { "action": "wait", "ms": 2000 },
    { "action": "screenshot" }
  ]
}
```

## Full reference

### Root-level fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | `string` | **required** | Target page URL. Supports `${VAR}` substitution. |
| `steps` | `Step[]` | **required** | Non-empty array of actions to execute. |
| `viewport` | `{ width, height }` | `1280×720` | Browser viewport dimensions in pixels. |
| `outputSize` | `{ width, height }` | — | Desired final video dimensions. Padding is adjusted (and the window scaled down if needed) so the output matches this size. User-specified `padding` acts as a minimum. |
| `colorScheme` | `"light"` \| `"dark"` | `"light"` | Preferred color scheme. |
| `waitForSelector` | `string` | — | Selector to wait for before executing steps. Accepts any [Playwright selector](https://playwright.dev/docs/selectors). |
| `speed` | `number` | `1.0` | Global playback speed multiplier (> 0). Values > 1 speed up, < 1 slow down. |
| `outputFormat` | `"webm"` \| `"mp4"` \| `"gif"` | `"webm"` | Video output format. MP4 and GIF require ffmpeg. |
| `cursor` | `boolean` \| `CursorOptions` | `true` | Animated cursor overlay. See [Cursor options](#cursor-options). |
| `chrome` | `boolean` \| `WindowChromeOptions` | `false` | macOS-style window chrome. See [Window chrome](#window-chrome). |
| `background` | `boolean` \| `BackgroundOptions` | `false` | Background padding and styling. See [Background](#background). |
| `setup` | `SetupBlock` | — | Steps to run before recording starts. See [Authentication](authentication.md). |
| `storageState` | `string` | — | Path to a Playwright storage state JSON file. |
| `cookies` | `Cookie[]` | — | Cookies to inject before navigation. |
| `localStorage` | `Record<string, string>` | — | localStorage key-value pairs to inject. |
| `headers` | `Record<string, string>` | — | Extra HTTP headers sent with every request. |
| `auth` | `AuthProvider` | — | Auth provider configuration. See [Authentication](authentication.md). |

### Cursor options

When `cursor` is `true` or omitted, a default cursor is rendered. Pass an object to customize:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the cursor. |
| `style` | `"default"` \| `"pointer"` \| `"text"` \| `"touch"` | `"default"` | Cursor image style. `"touch"` shows a centered circle for mobile UIs. |
| `size` | `number` | `24` | Cursor size in pixels. |
| `color` | `string` | — | Cursor color. |
| `rippleColor` | `string` | `'rgba(0, 0, 0, 0.4)'` | Click ripple effect color. |
| `rippleSize` | `number` | `100` | Click ripple effect radius. Set to `0` to disable ripples. |
| `transitionMs` | `number` | — | Override cursor movement duration. Omit for speed-based (500 px/s, clamped 100–600 ms). |
| `idleHide` | `boolean` | `true` | Automatically fade out the cursor after a period of no movement or click activity. Disabled when the recording uses explicit `hideCursor`/`showCursor` steps. |
| `idleHideMs` | `number` | `3000` | Idle threshold in milliseconds before the cursor auto-hides. |
| `fadeMs` | `number` | `400` | Fade in/out duration in milliseconds for cursor hide/show transitions (both auto-hide and explicit steps). |

### Window chrome

Adds a macOS-style title bar with traffic light buttons around the recording.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable window chrome. |
| `titleBarHeight` | `number` | `38` | Title bar height in pixels. |
| `titleBarColor` | `string` | `"#e8e8e8"` | Title bar background color. |
| `trafficLights` | `boolean` | `true` | Show red/yellow/green buttons. |
| `url` | `boolean` \| `string` | — | Display a URL. `true` uses the recording URL; a string displays that value. |

### Background

Adds padding, rounded corners, and a colored or gradient background around the window.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable background. |
| `color` | `string` | — | Solid background color (hex). |
| `gradient` | `{ from, to }` | `{ from: '#6366f1', to: '#a855f7' }` | Two-color diagonal gradient. Overrides `color`. This is the default when neither `color` nor `gradient` is set. |
| `padding` | `number` | `60` | Padding around the window in pixels. |
| `borderRadius` | `number` | `12` | Corner radius in pixels. |

### Cookies

Each cookie object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | yes | Cookie name. |
| `value` | `string` | yes | Cookie value. |
| `domain` | `string` | yes | Cookie domain. |
| `path` | `string` | yes | Cookie path. |
| `expires` | `number` | no | Expiry as Unix timestamp. |
| `httpOnly` | `boolean` | no | HTTP-only flag. |
| `secure` | `boolean` | no | Secure flag. |
| `sameSite` | `"Strict"` \| `"Lax"` \| `"None"` | no | SameSite policy. |

## Environment variable substitution

String values in the definition support `${VAR}` and `$VAR` syntax. Variables are resolved from `process.env` at load time. Substitution is recursive — it works inside nested objects and arrays.

```json
{
  "url": "https://${APP_HOST}/dashboard",
  "auth": {
    "provider": "supabase",
    "url": "${SUPABASE_URL}",
    "serviceRoleKey": "${SUPABASE_SERVICE_ROLE_KEY}",
    "email": "${TEST_USER_EMAIL}"
  },
  "steps": [...]
}
```

If a referenced variable is not set, testreel exits with an error.

## JSON Schema

A JSON Schema is published with the package at `recording-definition.schema.json`. Point your editor at it for autocomplete and validation:

```json
{
  "$schema": "./node_modules/testreel/recording-definition.schema.json",
  "url": "https://example.com",
  "steps": [...]
}
```

## Annotated example

```json
{
  "url": "https://demo.playwright.dev/todomvc",
  "viewport": { "width": 1280, "height": 720 },
  "outputSize": { "width": 1920, "height": 1080 },

  "cursor": { "style": "pointer" },
  "chrome": { "url": true },
  "background": {
    "gradient": { "from": "#667eea", "to": "#764ba2" },
    "borderRadius": 12
  },

  "speed": 1.5,
  "outputFormat": "mp4",

  "steps": [
    { "action": "wait", "ms": 1000 },
    { "action": "type", "selector": ".new-todo", "text": "Buy groceries" },
    { "action": "keyboard", "key": "Enter" },
    { "action": "type", "selector": ".new-todo", "text": "Walk the dog" },
    { "action": "keyboard", "key": "Enter" },
    { "action": "click", "selector": ".todo-list li:first-child .toggle" },
    { "action": "screenshot", "name": "completed-todo" },
    { "action": "zoom", "selector": ".todo-list", "scale": 2, "duration": 800 },
    { "action": "wait", "ms": 1500 },
    { "action": "zoom", "scale": 1 }
  ]
}
```
