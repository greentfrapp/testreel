# Contributing to testreel

Thanks for your interest in contributing! This guide will get you up and running.

## Development setup

```bash
# Fork the repo on GitHub first, then:
git clone https://github.com/<your-username>/testreel.git
cd testreel
pnpm install
npx playwright install chromium
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build with tsup (outputs to `dist/`) |
| `pnpm dev` | Build in watch mode |
| `pnpm test` | Run unit tests (vitest) |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:examples` | Run integration tests (requires build first) |
| `pnpm format` | Format code with Prettier |
| `pnpm format:check` | Check formatting |

## Project structure

```
src/
  index.ts          # Main API entry point
  cli.ts            # CLI entry point
  fixture.ts        # Playwright test fixture entry point
  recorder.ts       # High-level recording orchestration
  record-page.ts    # Low-level page recording API
  actions.ts        # Step action handlers
  cursor.ts         # Cursor tracking and events
  pipeline.ts       # FFmpeg filter graph construction
  post-process.ts   # FFmpeg execution and format conversion
  types.ts          # TypeScript type definitions
  __tests__/        # Unit tests
```

## Making changes

1. Fork the repo and clone your fork
2. Create a branch from `dev`
3. Make your changes
4. Run `pnpm format` to format code
5. Run `pnpm test` to verify tests pass
6. Open a pull request against `dev`

## Code style

- Prettier handles formatting (single quotes, no semicolons, trailing commas)
- Strict TypeScript — fix type errors, don't suppress them
- Imports are sorted automatically by the Prettier plugin

## Testing

- Unit tests go in `src/__tests__/` and use vitest
- Integration tests go in `examples/` and use Playwright
- Run `pnpm build && pnpm test:examples` for integration tests

## Reporting bugs

Open an issue at https://github.com/greentfrapp/testreel/issues with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your Node.js version and OS
