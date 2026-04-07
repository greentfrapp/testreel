# Authentication

Most web apps require authentication. Testreel supports several approaches so your recordings start in a logged-in state without capturing the login flow on video.

## Setup block (recommended)

The `setup` block runs steps **before** video recording starts. Session state (cookies, localStorage, etc.) is automatically carried over into the recorded session.

```json
{
  "url": "https://app.example.com/dashboard",
  "setup": {
    "url": "https://app.example.com/login",
    "steps": [
      { "action": "fill", "selector": "#email", "text": "user@example.com" },
      { "action": "fill", "selector": "#password", "text": "s3cret" },
      { "action": "click", "selector": "button[type=submit]" },
      { "action": "wait", "ms": 2000 }
    ]
  },
  "steps": [
    { "action": "screenshot", "name": "dashboard" }
  ]
}
```

The setup block accepts:
- `url` (optional) — the page to navigate to for setup. Defaults to the main `url`.
- `steps` — same actions as the recording. Cursor is disabled during setup.

Setup also preserves scroll position — if your setup scrolls to a specific section, the recording starts at that position.

You can also provide setup in a separate file via the CLI:

```bash
npx testreel recording.json --setup login-steps.json
```

## localStorage injection

For apps that store auth tokens in localStorage (e.g., Supabase, Firebase):

```json
{
  "url": "https://app.example.com",
  "localStorage": {
    "sb-auth-token": "{\"access_token\":\"eyJ...\",\"refresh_token\":\"abc\"}"
  },
  "steps": [...]
}
```

Testreel navigates to the URL, injects the entries, then reloads to let the app pick up the session.

## Cookies

```json
{
  "url": "https://app.example.com",
  "cookies": [
    {
      "name": "session",
      "value": "abc123",
      "domain": "app.example.com",
      "path": "/"
    }
  ],
  "steps": [...]
}
```

## Interactive login (`testreel login`)

For OAuth flows or other logins that are hard to automate, use the `login` subcommand. It opens a real browser, lets you log in manually, and exports the session state to a JSON file.

```bash
# Open a browser, log in, then close the window to save
npx testreel login https://app.example.com --save-state ./state.json

# Use Chrome instead of Chromium (needed for Google OAuth and other
# providers that block automation-controlled browsers)
npx testreel login https://app.example.com --save-state ./state.json --channel chrome

# Connect to an already-running browser via CDP
npx testreel login https://app.example.com --save-state ./state.json --cdp http://localhost:9222

# Headless login with a web-based viewer (useful on remote/CI machines)
npx testreel login https://app.example.com --save-state ./state.json --remote
```

Then reference the saved state in your recording definition:

```json
{
  "url": "https://app.example.com",
  "storageState": "./state.json",
  "steps": [...]
}
```

## Playwright storage state

If you already have a Playwright `storageState` JSON file (from `context.storageState()`), point to it directly:

```json
{
  "url": "https://app.example.com",
  "storageState": "./auth-state.json",
  "steps": [...]
}
```

## Extra headers

For APIs or apps that accept auth headers (e.g., Bearer tokens):

```json
{
  "url": "https://app.example.com",
  "headers": {
    "Authorization": "Bearer eyJ..."
  },
  "steps": [...]
}
```

## Supabase auth provider

For Supabase-based apps, testreel can generate a session automatically using a service role key:

```json
{
  "url": "https://app.example.com",
  "auth": {
    "provider": "supabase",
    "url": "${SUPABASE_URL}",
    "serviceRoleKey": "${SUPABASE_SERVICE_ROLE_KEY}",
    "email": "${TEST_USER_EMAIL}"
  },
  "steps": [...]
}
```

This generates localStorage tokens and merges them into the recording session.

## Combining methods

These methods can be combined. For example, use `localStorage` for auth tokens alongside a `setup` block that navigates past an onboarding screen:

```json
{
  "url": "https://app.example.com/dashboard",
  "localStorage": {
    "auth-token": "${AUTH_TOKEN}"
  },
  "setup": {
    "steps": [
      { "action": "click", "selector": "button.dismiss-onboarding" },
      { "action": "wait", "ms": 1000 }
    ]
  },
  "steps": [
    { "action": "screenshot", "name": "ready" }
  ]
}
```
