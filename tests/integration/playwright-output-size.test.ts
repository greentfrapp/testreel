/**
 * Integration test for the outputSize option.
 *
 * Verifies that recordings with outputSize produce videos at the
 * expected dimensions, with padding adjusted automatically.
 *
 * Run:
 *   pnpm exec playwright test --config tests/integration/playwright.config.ts playwright-output-size
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const ffmpeg = path.resolve('node_modules/ffmpeg-static/ffmpeg')
const cli = path.resolve('dist/cli.cjs')

function getVideoDimensions(videoPath: string): { width: number; height: number } {
  const output = execSync(`${ffmpeg} -i "${videoPath}" 2>&1 || true`, {
    encoding: 'utf8',
  })
  const match = output.match(/(\d+)x(\d+)(?=.*SAR|,)/)
  if (!match) throw new Error(`Could not parse dimensions from ${videoPath}`)
  return { width: parseInt(match[1]), height: parseInt(match[2]) }
}

test.describe('outputSize', () => {
  const outputDir = path.resolve('test-results/output-size-test')

  test.beforeAll(() => {
    fs.mkdirSync(outputDir, { recursive: true })
  })

  test('produces 1920x1080 video with chrome and background', () => {
    const defPath = path.join(outputDir, 'def-1080p.json')
    fs.writeFileSync(
      defPath,
      JSON.stringify({
        url: 'https://demo.playwright.dev/todomvc',
        viewport: { width: 1280, height: 720 },
        outputSize: { width: 1920, height: 1080 },
        chrome: { url: true },
        background: true,
        steps: [{ action: 'wait', ms: 500 }],
      }),
    )

    execSync(`node ${cli} ${defPath} --output ${outputDir} --clean`, {
      timeout: 60_000,
    })

    const videos = fs
      .readdirSync(outputDir)
      .filter((f) => f.endsWith('.webm'))
    expect(videos.length).toBeGreaterThan(0)

    const dims = getVideoDimensions(path.join(outputDir, videos[0]))
    expect(dims.width).toBe(1920)
    expect(dims.height).toBe(1080)
  })

  test('scales window down when viewport exceeds outputSize', () => {
    const defPath = path.join(outputDir, 'def-small.json')
    fs.writeFileSync(
      defPath,
      JSON.stringify({
        url: 'https://demo.playwright.dev/todomvc',
        viewport: { width: 1280, height: 720 },
        outputSize: { width: 800, height: 600 },
        chrome: true,
        background: true,
        steps: [{ action: 'wait', ms: 500 }],
      }),
    )

    execSync(`node ${cli} ${defPath} --output ${outputDir} --clean`, {
      timeout: 60_000,
    })

    const videos = fs
      .readdirSync(outputDir)
      .filter((f) => f.endsWith('.webm'))
    expect(videos.length).toBeGreaterThan(0)

    const dims = getVideoDimensions(path.join(outputDir, videos[0]))
    expect(dims.width).toBe(800)
    expect(dims.height).toBe(600)
  })
})
