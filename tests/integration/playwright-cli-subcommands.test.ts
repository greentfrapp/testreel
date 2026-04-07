/**
 * Integration test for the `validate` CLI subcommand.
 *
 * Run:
 *   pnpm exec playwright test --config tests/integration/playwright.config.ts playwright-cli-subcommands
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const cli = path.resolve('dist/cli.cjs')

test.describe('CLI validate subcommand', () => {
  const outDir = path.resolve('test-results/cli-subcommands-test')

  test.beforeAll(() => {
    fs.rmSync(outDir, { recursive: true, force: true })
    fs.mkdirSync(outDir, { recursive: true })
  })

  test('validate exits 0 on a valid definition and writes no recording', () => {
    const defPath = path.join(outDir, 'valid.json')
    fs.writeFileSync(
      defPath,
      JSON.stringify({
        url: 'https://example.com',
        viewport: { width: 480, height: 320 },
        steps: [
          { action: 'click', selector: '#btn' },
          { action: 'wait', ms: 100 },
        ],
      }),
    )

    const result = spawnSync('node', [cli, 'validate', defPath], {
      encoding: 'utf8',
      timeout: 30_000,
    })

    expect(result.status).toBe(0)
    // No video should have been produced
    expect(fs.readdirSync(outDir).some((f) => f.endsWith('.webm'))).toBe(false)
  })

  test('validate exits non-zero on an invalid definition', () => {
    const defPath = path.join(outDir, 'invalid.json')
    // `click` action requires a selector — this should fail validation
    fs.writeFileSync(
      defPath,
      JSON.stringify({
        url: 'https://example.com',
        viewport: { width: 480, height: 320 },
        steps: [{ action: 'click' }],
      }),
    )

    const result = spawnSync('node', [cli, 'validate', defPath], {
      encoding: 'utf8',
      timeout: 30_000,
    })

    expect(result.status).not.toBe(0)
    const combined = (result.stdout || '') + (result.stderr || '')
    expect(combined.toLowerCase()).toContain('selector')
  })
})
