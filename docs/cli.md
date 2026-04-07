# CLI Reference

## Recording (default command)

```
testreel <definition> [options]
```

Run a recording from a definition file.

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<definition>` | Path to a recording definition file (`.json`, `.jsonc`, `.yaml`, `.yml`) |

**Options:**

| Flag | Description |
|------|-------------|
| `-o, --output <dir>` | Output directory (default: `./testreel-output`) |
| `--setup <file>` | Setup file — runs before recording (login, dismiss modals, etc.) |
| `--format <fmt>` | Output format: `webm`, `mp4`, or `gif` (overrides definition) |
| `--speed <n>` | Playback speed multiplier (overrides definition) |
| `--headed` | Run browser in headed mode (visible window) |
| `--dry-run` | Validate definition and print summary without recording |
| `--verbose` | Detailed output (per-step timing, diagnostics) |
| `--quiet` | Suppress all output except errors and final paths |
| `--clean` | Remove previous output files before recording |
| `--keep-intermediates` | Keep intermediate files (cursor JSON, etc.) |
| `-v, --version` | Show version |
| `-h, --help` | Show help |

**Examples:**

```bash
# Basic recording
npx testreel recording.json

# Custom output directory
npx testreel recording.json --output ./demo-videos

# Debug with visible browser
npx testreel recording.json --headed

# Fast recording, GIF output
npx testreel recording.json --speed 2 --format gif

# Separate setup file for login
npx testreel recording.json --setup login.json

# Validate only
npx testreel recording.json --dry-run
```

## validate

```
testreel validate <file> [options]
```

Validate a recording definition and print a summary. Exits with code 0 if valid, 1 if invalid.

**Options:**

| Flag | Description |
|------|-------------|
| `--setup <file>` | Also validate a setup file alongside the definition |
| `--quiet` | Exit silently on success, print errors on failure |

```bash
npx testreel validate recording.json
npx testreel validate recording.json --setup login.json
npx testreel validate recording.json --quiet && echo "OK"
```

## init

```
testreel init
```

Interactively create a new recording definition. Prompts for URL, viewport, and basic steps, then writes a JSON file.

```bash
npx testreel init
```

## login

```
testreel login <url> --save-state <file> [options]
```

Open a browser to log in manually, then save the session state for use in recordings.

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<url>` | URL to navigate to for login |

**Options:**

| Flag | Description |
|------|-------------|
| `--save-state <file>` | **(required)** Path to save the exported session state JSON |
| `--channel <name>` | Browser channel (e.g., `"chrome"`) — use for OAuth providers that block Chromium |
| `--cdp <url>` | Connect to an existing browser via Chrome DevTools Protocol |
| `--remote` | Launch headless browser with a web-based viewer |
| `--port <number>` | Viewer port for `--remote` mode (default: `9222`) |

`--remote` and `--cdp` are mutually exclusive.

**Examples:**

```bash
# Standard interactive login
npx testreel login https://app.example.com --save-state ./state.json

# Use Chrome for Google OAuth
npx testreel login https://app.example.com --save-state ./state.json --channel chrome

# Connect to existing browser
npx testreel login https://app.example.com --save-state ./state.json --cdp http://localhost:9222

# Headless with web viewer (for remote machines)
npx testreel login https://app.example.com --save-state ./state.json --remote --port 8080
```

Then use the saved state in a recording:

```json
{
  "url": "https://app.example.com",
  "storageState": "./state.json",
  "steps": [...]
}
```
