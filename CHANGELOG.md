# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-04-07

### Added
- `outputSize` option for exact target video dimensions, with automatic window scaling and padding adjustment
- `zoom` parameter on `click` steps for click-anchored zoom-in animations
- Per-step `hideCursor` / `showCursor` controls plus automatic idle cursor hide with fade
- Touch cursor variant for recording mobile UI flows
- Gradient background as the new default background style
- `clean` option to remove previous output files before recording (CLI: `--clean`, API: `clean: true`); Playwright fixture defaults to `clean: true`
- GitHub Actions CI (Node 20, 22) and automated npm release workflow
- CONTRIBUTING.md with development setup instructions
- README badges for npm version, CI status, and license
- Bundled docs and `AGENTS.md` for AI coding agent support
- Integration test suite under `tests/integration/` covering output formats (webm/mp4/gif), output sizes, fixture context sharing, duration parity, screenshot action, JSON/JSONC/YAML config loading, `validate` CLI, chrome+background compositing, and core actions end-to-end

### Changed
- Default cursor size increased from 24 to 48
- Cursor-video alignment fixed and click zoom behavior improved
- Documented click zoom, cursor speed, and ripple defaults
- Replaced Wikipedia examples with TodoMVC throughout docs
- Switched contributor workflow to pnpm
- Minimum supported Node version is now 20 (Node 18 dropped)

### Fixed
- Zoom step now works correctly when combined with window chrome and background
- Ripple overlay is now visible and uses a neutral color
- Cursor hotspots corrected
- Post-processing failure when `scale > 1` was used with chrome/background (option subsequently removed in favor of `outputSize`)

### Removed
- `scale` / `deviceScaleFactor` option (superseded by `outputSize`)

## [0.1.1] - 2026-03-31

### Fixed
- FFmpeg resolution in ESM projects — async fallback chain: `FFMPEG_PATH` env var, `require('ffmpeg-static')`, `import('ffmpeg-static')`, system `ffmpeg`
- Improved FFmpeg ENOENT error message with actionable install/config suggestions

### Added
- `name` option in `RecordPageOptions` for stable output filenames (e.g., `add-product-demo.webm`)
- Playwright fixture defaults recording name to sanitized test title
- `SelectorOrLocator` type — `PageRecorder` methods now accept Playwright `Locator` objects in addition to string selectors
- JSDoc documentation on `TestreelFixtures` and all `PageRecorder` methods
- Fixture composition guide with performance notes in Playwright docs

## [0.1.0] - 2026-03-30

### Added
- Initial release
- `record()` API for recording from JSON/JSONC/YAML definitions
- `recordPage()` API for manual Playwright page recording
- Playwright test fixture (`testreel/playwright`)
- CLI with `record`, `validate`, `init`, and `login` commands
- 13 step actions: click, type, fill, clear, select, scroll, hover, keyboard, navigate, screenshot, zoom, wait, waitForNetwork
- Animated cursor overlay with click ripples
- macOS-style window chrome rendering
- Background styling with gradients, padding, and rounded corners
- Output formats: WebM (default), MP4, GIF
- Retina/HiDPI support via `scale` option
- Environment variable substitution in definitions (`${VAR}`)
- Authentication: setup blocks, localStorage/cookies, storage state, interactive login, Supabase provider
- Global and per-step speed control
- JSON Schema for IDE autocomplete

[Unreleased]: https://github.com/greentfrapp/testreel/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/greentfrapp/testreel/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/greentfrapp/testreel/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/greentfrapp/testreel/releases/tag/v0.1.0
