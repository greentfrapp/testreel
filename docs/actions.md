# Actions Reference

Every step in a recording definition has an `action` field that determines what happens. This page documents all 15 actions.

> **Selector support:** All `selector` fields accept any [Playwright selector](https://playwright.dev/docs/selectors) — CSS, text, role, XPath, and more. For example: `"button.submit"`, `"text=Sign in"`, `"role=button[name='Submit']"`, or `"//button[@type='submit']"`.

## Common step properties

These optional fields are available on every action:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `pauseAfter` | `number` | `500` | Milliseconds to wait after the action completes. Not applied to `wait` steps. |
| `speed` | `number` | — | Per-step speed multiplier (overrides the global `speed`). Must be > 0. |
| `timeout` | `number` | `5000` | Timeout in ms for selector resolution. |
| `waitFor` | `string` | — | Selector or `"networkidle"` to wait for before the action executes. Accepts any Playwright selector. |

## wait

Pause execution for a duration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ms` | `number` | `1000` | Duration in milliseconds. |

```json
{ "action": "wait", "ms": 2000 }
```

## click

Click an element.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `selector` | `string` | yes | Selector for the target element. |
| `zoom` | `number` | — | Zoom into the element at this scale before clicking. Automatically zooms back out after. |

```json
{ "action": "click", "selector": "button.submit" }
```

When cursor is enabled, the cursor animates to the element and a ripple effect plays on click.

### Click with zoom

Add `zoom` to zoom into the click target, then automatically zoom back out after the click:

```json
{ "action": "click", "selector": ".todo .toggle", "zoom": 2 }
```

When consecutive click steps both have `zoom`, the intermediate zoom-out is skipped and the camera pans directly between targets:

```json
{ "action": "click", "selector": ".item-1", "zoom": 2 },
{ "action": "click", "selector": ".item-2", "zoom": 2 },
{ "action": "click", "selector": ".item-3", "zoom": 2 }
```

## type

Type text into an element character-by-character, producing realistic keystrokes.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `selector` | `string` | yes | — | Selector for the input element. |
| `text` | `string` | yes | — | Text to type. |
| `delay` | `number` | no | `80` | Delay between keystrokes in ms. |
| `clear` | `boolean` | no | `false` | Select all and replace existing content before typing. |

```json
{ "action": "type", "selector": "#search", "text": "testreel", "delay": 50 }
```

## fill

Set an input's value instantly (no keystroke animation).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `selector` | `string` | yes | Selector for the input element. |
| `text` | `string` | yes | Value to set. |

```json
{ "action": "fill", "selector": "#email", "text": "user@example.com" }
```

Use `fill` when you don't need the typing animation (e.g., in setup steps or for long values).

## clear

Clear an input field by selecting all content and pressing Backspace.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `selector` | `string` | yes | Selector for the input element. |

```json
{ "action": "clear", "selector": "#search" }
```

## select

Select an option from a `<select>` dropdown.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `selector` | `string` | yes | Selector for the `<select>` element. |
| `value` | `string` | yes | The option value to select. |

```json
{ "action": "select", "selector": "#country", "value": "us" }
```

## scroll

Scroll the page by a pixel delta with an eased animation.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `x` | `number` | `0` | Horizontal scroll delta in pixels. |
| `y` | `number` | `0` | Vertical scroll delta in pixels. |

```json
{ "action": "scroll", "y": 500 }
```

The scroll animation uses cubic easing over ~600ms (adjusted by `speed`).

## hover

Move the cursor over an element.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `selector` | `string` | yes | Selector for the target element. |

```json
{ "action": "hover", "selector": ".tooltip-trigger" }
```

Useful for triggering hover states, tooltips, or dropdown menus.

## keyboard

Press a keyboard key.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | yes | Key to press. Uses Playwright key names (e.g., `"Enter"`, `"Escape"`, `"Tab"`, `"ArrowDown"`). |

```json
{ "action": "keyboard", "key": "Enter" }
```

See [Playwright keyboard documentation](https://playwright.dev/docs/api/class-keyboard#keyboard-press) for the full list of key names.

## navigate

Navigate to a new URL.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | `string` | yes | URL to navigate to. Supports `${VAR}` substitution. |

```json
{ "action": "navigate", "url": "https://example.com/settings" }
```

Navigation waits for `networkidle` (up to 10s) and resets any active zoom state.

## screenshot

Capture a PNG screenshot.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | auto-generated | Filename for the screenshot (without extension). |
| `fullPage` | `boolean` | `false` | Capture the full scrollable page instead of just the viewport. |

```json
{ "action": "screenshot", "name": "dashboard-loaded" }
```

Screenshots are saved to the output directory. A final screenshot is always captured automatically at the end of every recording.

## zoom

Zoom into a region of the page using a CSS transform animation.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `selector` | `string` | — | Selector to zoom into (centers on the element). |
| `scale` | `number` | `2` | Zoom scale factor. Use `1` to reset zoom. |
| `x` | `number` | `640` | X coordinate to zoom into (used when no `selector`). |
| `y` | `number` | `360` | Y coordinate to zoom into (used when no `selector`). |
| `duration` | `number` | `600` | Animation duration in milliseconds. |

```json
{ "action": "zoom", "selector": "#feature-card", "scale": 2.5, "duration": 800 }
```

To reset zoom back to normal:

```json
{ "action": "zoom", "scale": 1 }
```

The zoom is purely visual — it applies a CSS `transform: scale() translate()` to the document root. Interactive actions (click, type, etc.) automatically suspend and restore the zoom so that selectors work at their real coordinates.

## waitForNetwork

Wait for a specific network response before continuing.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `urlPattern` | `string` | yes | URL substring to match against completed responses. |

```json
{ "action": "waitForNetwork", "urlPattern": "/api/data" }
```

Useful for waiting on API calls to complete before taking a screenshot or interacting with dynamically loaded content.

## hideCursor

Fade out the cursor overlay. Takes no fields. Useful for hiding the cursor during a long pause, demo voiceover, or while showing a result the cursor would distract from. The fade duration is controlled by the cursor `fadeMs` option (default `200`).

```json
{ "action": "hideCursor" }
```

## showCursor

Fade the cursor overlay back in after a `hideCursor` step. Takes no fields.

```json
{ "action": "showCursor" }
```

> **Auto-hide:** by default the cursor automatically fades out after 3 seconds of no movement or click activity (configurable via the `idleHide`, `idleHideMs`, and `fadeMs` cursor options). Adding any explicit `hideCursor`/`showCursor` step in a recording disables auto-hide for that recording — explicit control wins.
