# Testreel — Agent & Developer Guidelines

Testreel is a programmatic video recording library for web applications. It takes browser interactions defined in JSON/YAML and generates polished screen recordings (WebM, MP4, GIF) with cursor overlays, window chrome, backgrounds, and zoom effects. Built on Playwright for browser automation and FFmpeg for video post-processing.

**Before writing code that uses testreel, read the relevant documentation bundled with the package.**

## Commands

This repo uses pnpm (see `packageManager` in package.json). Use `pnpm` for all development commands. Quick Reference examples below use `npm`/`npx` as they target consumers who may use any package manager.

- **Build:** `pnpm build` (tsup, outputs to `dist/`)
- **Dev:** `pnpm dev` (tsup watch mode)
- **Test:** `pnpm test` (vitest)
- **Single test:** `npx vitest run src/__tests__/cursor.test.ts`
- **Test watch:** `pnpm test:watch`
- **Integration tests:** `pnpm test:examples` (Playwright-based, requires build first)
- **Format:** `pnpm format` (Prettier)
- **Format check:** `pnpm format:check`

## Architecture

**Three entry points** (built via tsup):
1. `src/index.ts` → main API (`record()`, `loadDefinition()`, `login()`, etc.) — ESM + CJS
2. `src/cli.ts` → CLI (`testreel` command) — CJS with shebang
3. `src/fixture.ts` → Playwright test fixture (`testreel/playwright`) — ESM + CJS

**Core recording flow:**
`loadDefinition()` → `record()` → launch browser → run setup block (no video) → create recording context → execute steps sequentially → stop recording → post-process with FFmpeg (cursor overlay → window frame → background → speed/zoom)

**Key modules:**
- `recorder.ts` — orchestrates the full recording pipeline
- `record-page.ts` — lower-level API for manual page recording (used by Playwright fixture)
- `actions.ts` — step action handlers mapped via `ACTIONS` registry; step types are a discriminated union in `types.ts`
- `post-process.ts` / `pipeline.ts` — FFmpeg filter graph construction and execution
- `chrome-renderer.ts` / `window-frame.ts` — renders macOS-style window chrome and background as PNGs via Playwright, then composites via FFmpeg
- `cursor.ts` — tracks cursor positions over time, serialized to JSON for FFmpeg overlay
- `validation.ts` — loads JSON/JSONC/YAML configs with `${ENV_VAR}` substitution

**Auth system:** `providers/` directory with a router pattern. Currently supports Supabase magic link auth.

## Code Conventions

- ES Module project (`"type": "module"` in package.json)
- Strict TypeScript, target ES2022, bundler module resolution
- Prettier with single quotes, no semicolons, trailing commas, `@trivago/prettier-plugin-sort-imports`
- CLI uses lazy imports to avoid loading heavy modules (playwright-core) at startup
- `playwright-core` is external (peer dependency, not bundled)
- tsup build has a custom esbuild plugin (`resolvePngAssets`) that copies cursor PNGs to dist
- SVG and HTML files are imported as text strings (tsup loader config)

## Testing

- Vitest for unit tests in `src/__tests__/`
- Tests use `vi.fn()` mocks with minimal mock objects
- Playwright integration tests in `examples/` (separate playwright.config.ts)
- JSON Schema at `recording-definition.schema.json` for config file validation/IDE autocomplete

## Bundled Documentation

When testreel is installed as a dependency, docs are at `node_modules/testreel/dist/docs/`:

- [Getting Started](./dist/docs/getting-started.md) — Installation, first recording, quick examples
- [API Reference](./dist/docs/api-reference.md) — All exports, function signatures, types, and options
- [Recording Definitions](./dist/docs/recording-definitions.md) — JSON/YAML definition format and schema
- [Actions](./dist/docs/actions.md) — All 13 step types with parameters and defaults
- [Playwright Integration](./dist/docs/playwright.md) — Test fixtures (`page` and `testreelPage`), fixture composition
- [CLI](./dist/docs/cli.md) — `testreel` command, subcommands, and options
- [Authentication](./dist/docs/authentication.md) — Auth providers, setup blocks, session state
- [Examples](./dist/docs/examples.md) — Common patterns and recipes

When working on the testreel source repo itself, docs are at `docs/` in the project root.

## Quick Reference

### Three ways to use testreel

**1. Programmatic API:**
```ts
import { record } from 'testreel'

const result = await record('definition.yaml', { outputDir: './output' })
```

**2. Playwright test fixture:**
```ts
import { test, expect } from '@playwright/test'
import { testreelFixtures, type TestreelFixtures } from 'testreel/playwright'

const recorded = test.extend<TestreelFixtures>({
  ...testreelFixtures,
})

recorded('demo', async ({ testreelPage }) => {
  await testreelPage.navigate('https://example.com')
  await testreelPage.click('.button')
  await testreelPage.type('input[name="search"]', 'Hello')
  await testreelPage.stop()
})
```

**3. CLI:**
```bash
testreel definition.yaml --format mp4 --output ./recordings
```

### Key concepts

- **Recording definitions** are JSON/JSONC/YAML files describing a URL, viewport, steps, and visual options
- **Steps** are a sequence of actions (`click`, `type`, `fill`, `scroll`, `zoom`, `navigate`, `wait`, etc.)
- **Post-processing** adds cursor overlay, window chrome, background, and speed changes via FFmpeg
- **Setup blocks** run before recording starts (e.g., login flows) — not captured in video
- **Selectors** accept CSS selectors, XPath, Playwright text/role selectors, or Playwright `Locator` objects
- **`${ENV_VAR}` substitution** works in all string values in definitions

### Package exports

| Import path | What it provides |
|-------------|-----------------|
| `testreel` | `record()`, `recordPage()`, `loadDefinition()`, `login()`, `resolveAuth()`, cursor utilities, types |
| `testreel/playwright` | `test`, `testreelFixtures`, `expect`, `PageRecorder`, `TestreelFixtures` type |

### JSON Schema

IDE autocomplete for definition files: reference `recording-definition.schema.json` from the package.
