/**
 * Integration test for definition file formats: JSON, JSONC, YAML.
 *
 * Verifies the CLI correctly dispatches on file extension and parses
 * each supported format end-to-end.
 *
 * Run:
 *   pnpm exec playwright test --config tests/integration/playwright.config.ts playwright-config-formats
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const cli = path.resolve('dist/cli.cjs')

const INLINE_URL =
  'data:text/html,' +
  encodeURIComponent(
    '<!doctype html><title>t</title><body style="background:#222;color:#fff;margin:40px">hello</body>',
  )

test.describe('definition file formats', () => {
  const baseDir = path.resolve('test-results/config-formats-test')

  test.beforeAll(() => {
    fs.rmSync(baseDir, { recursive: true, force: true })
    fs.mkdirSync(baseDir, { recursive: true })
  })

  const cases = [
    {
      ext: 'json',
      contents: JSON.stringify({
        url: INLINE_URL,
        viewport: { width: 480, height: 320 },
        steps: [{ action: 'wait', ms: 300 }],
      }),
    },
    {
      ext: 'jsonc',
      contents: `{
        // a comment — JSONC should strip this
        "url": "${INLINE_URL}",
        "viewport": { "width": 480, "height": 320 },
        "steps": [
          { "action": "wait", "ms": 300 } // trailing comment
        ]
      }`,
    },
    {
      ext: 'yaml',
      contents: `url: "${INLINE_URL}"
viewport:
  width: 480
  height: 320
steps:
  - action: wait
    ms: 300
`,
    },
  ]

  for (const { ext, contents } of cases) {
    test(`loads .${ext} definition and produces a recording`, () => {
      const outDir = path.join(baseDir, ext)
      fs.mkdirSync(outDir, { recursive: true })
      const defPath = path.join(outDir, `def.${ext}`)
      fs.writeFileSync(defPath, contents)

      execSync(`node ${cli} ${defPath} --output ${outDir} --clean`, {
        timeout: 90_000,
        stdio: 'pipe',
      })

      const webms = fs.readdirSync(outDir).filter((f) => f.endsWith('.webm'))
      expect(webms.length).toBeGreaterThan(0)
      expect(fs.statSync(path.join(outDir, webms[0])).size).toBeGreaterThan(0)
    })
  }
})
