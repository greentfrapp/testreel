/**
 * Integration test for the `screenshot` action.
 *
 * Verifies that screenshot steps produce real PNG files on disk and
 * that they're referenced in the output.json manifest.
 *
 * Run:
 *   pnpm exec playwright test --config tests/integration/playwright.config.ts playwright-screenshot-action
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const cli = path.resolve('dist/cli.cjs')

const INLINE_URL =
  'data:text/html,' +
  encodeURIComponent(
    '<!doctype html><title>t</title><body style="background:#222;color:#fff;font:24px sans-serif;margin:40px">hello</body>',
  )

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

function isPng(filePath: string): boolean {
  const buf = fs.readFileSync(filePath).subarray(0, 4)
  return PNG_MAGIC.every((b, i) => buf[i] === b)
}

test.describe('screenshot action', () => {
  const outDir = path.resolve('test-results/screenshot-action-test')

  test.beforeAll(() => {
    fs.rmSync(outDir, { recursive: true, force: true })
    fs.mkdirSync(outDir, { recursive: true })
  })

  test('produces named and unnamed PNG screenshots referenced in manifest', () => {
    const defPath = path.join(outDir, 'def.json')
    fs.writeFileSync(
      defPath,
      JSON.stringify({
        url: INLINE_URL,
        viewport: { width: 480, height: 320 },
        steps: [
          { action: 'wait', ms: 200 },
          { action: 'screenshot', name: 'first-shot' },
          { action: 'wait', ms: 200 },
          { action: 'screenshot' },
        ],
      }),
    )

    execSync(`node ${cli} ${defPath} --output ${outDir} --clean`, {
      timeout: 90_000,
      stdio: 'pipe',
    })

    const pngs = fs.readdirSync(outDir).filter((f) => f.endsWith('.png'))
    // Two explicit screenshots + one final screenshot the recorder always takes
    expect(pngs.length).toBeGreaterThanOrEqual(2)

    const named = pngs.find((f) => f === 'first-shot.png')
    expect(named).toBeDefined()

    for (const f of pngs) {
      const full = path.join(outDir, f)
      expect(fs.statSync(full).size).toBeGreaterThan(0)
      expect(isPng(full)).toBe(true)
    }

    const manifestPath = path.join(outDir, 'output.json')
    expect(fs.existsSync(manifestPath)).toBe(true)
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    expect(Array.isArray(manifest.screenshots)).toBe(true)
    expect(
      manifest.screenshots.some((s: string) => s.endsWith('first-shot.png')),
    ).toBe(true)
  })
})
