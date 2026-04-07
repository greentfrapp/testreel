/**
 * Integration test for window chrome + background styling.
 *
 * Verifies the chrome-renderer + background composition pipeline produces
 * a video whose dimensions are larger than the inner viewport (i.e. chrome
 * bar and padding were actually composited in).
 *
 * Run:
 *   pnpm exec playwright test --config tests/integration/playwright.config.ts playwright-chrome-background
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const ffmpeg = path.resolve('node_modules/ffmpeg-static/ffmpeg')
const cli = path.resolve('dist/cli.cjs')

const INLINE_URL =
  'data:text/html,' +
  encodeURIComponent(
    '<!doctype html><title>t</title><body style="background:#fff;margin:0;padding:40px;font:24px sans-serif">hello</body>',
  )

function getVideoDimensions(videoPath: string): {
  width: number
  height: number
} {
  const output = execSync(`${ffmpeg} -i "${videoPath}" 2>&1 || true`, {
    encoding: 'utf8',
  })
  const match = output.match(/(\d+)x(\d+)(?=.*SAR|,)/)
  if (!match) throw new Error(`Could not parse dimensions from ${videoPath}`)
  return { width: parseInt(match[1]), height: parseInt(match[2]) }
}

test.describe('window chrome + background', () => {
  const outDir = path.resolve('test-results/chrome-background-test')

  test.beforeAll(() => {
    fs.rmSync(outDir, { recursive: true, force: true })
    fs.mkdirSync(outDir, { recursive: true })
  })

  test('composites chrome and padded gradient background around the viewport', () => {
    const viewport = { width: 800, height: 500 }
    const padding = 60

    const defPath = path.join(outDir, 'def.json')
    fs.writeFileSync(
      defPath,
      JSON.stringify({
        url: INLINE_URL,
        viewport,
        chrome: { url: true },
        background: {
          gradient: { from: '#667eea', to: '#764ba2' },
          padding,
          borderRadius: 12,
        },
        steps: [{ action: 'wait', ms: 400 }],
      }),
    )

    execSync(`node ${cli} ${defPath} --output ${outDir} --clean`, {
      timeout: 90_000,
      stdio: 'pipe',
    })

    const webms = fs.readdirSync(outDir).filter((f) => f.endsWith('.webm'))
    expect(webms.length).toBeGreaterThan(0)

    const dims = getVideoDimensions(path.join(outDir, webms[0]))

    // Width should be at least viewport + 2 * padding (background padding)
    expect(dims.width).toBeGreaterThanOrEqual(viewport.width + 2 * padding)
    // Height should be even more — viewport + 2 * padding + chrome bar
    expect(dims.height).toBeGreaterThan(viewport.height + 2 * padding)
  })
})
