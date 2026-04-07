/**
 * Integration test that verifies config-created (JSONC) and Playwright-created
 * videos have approximately the same duration for equivalent steps.
 *
 * This catches cursor tracker time-base misalignment, which previously caused
 * the Playwright path to produce longer videos with dead time at the start.
 *
 * Run:
 *   pnpm exec playwright test --config tests/integration/playwright.config.ts playwright-duration-parity
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { test as base, expect } from '@playwright/test'
import {
  testreelFixtures,
  type TestreelFixtures,
} from 'testreel/playwright'

const ffmpeg = path.resolve('node_modules/ffmpeg-static/ffmpeg')
const cli = path.resolve('dist/cli.cjs')

function getVideoDuration(videoPath: string): number {
  const output = execSync(`${ffmpeg} -i "${videoPath}" -f null - 2>&1 || true`, {
    encoding: 'utf8',
  })
  const match = output.match(/time=(\d+):(\d+):(\d+\.\d+)/)
  if (!match) throw new Error(`Could not parse duration from ${videoPath}`)
  return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3])
}

const recorded = base.extend<TestreelFixtures>({
  ...testreelFixtures,
})

recorded.use({
  testreelOptions: {
    viewport: { width: 1280, height: 720 },
    cursor: true,
    chrome: { url: true },
    background: true,
  },
})

const outputDir = path.resolve('test-results/duration-parity-test')

recorded('config and playwright videos have similar duration', async ({
  testreelPage,
}) => {
  fs.mkdirSync(outputDir, { recursive: true })

  // ── Playwright recording ────────────────────────────────────────────
  await testreelPage.navigate('https://demo.playwright.dev/todomvc')
  await testreelPage.wait(500)
  await testreelPage.click('.new-todo')
  await testreelPage.type('.new-todo', 'Test')
  await testreelPage.keyboard('Enter')
  await testreelPage.wait(500)
  const pwResult = await testreelPage.stop()

  expect(pwResult.video).toBeTruthy()
  const pwDuration = getVideoDuration(pwResult.video!)

  // ── Config (JSONC) recording ────────────────────────────────────────
  const defPath = path.join(outputDir, 'parity-def.json')
  fs.writeFileSync(
    defPath,
    JSON.stringify({
      url: 'https://demo.playwright.dev/todomvc',
      viewport: { width: 1280, height: 720 },
      cursor: true,
      chrome: { url: true },
      background: true,
      steps: [
        { action: 'wait', ms: 500 },
        { action: 'click', selector: '.new-todo' },
        { action: 'type', selector: '.new-todo', text: 'Test' },
        { action: 'keyboard', key: 'Enter' },
        { action: 'wait', ms: 500 },
      ],
    }),
  )

  execSync(`node ${cli} ${defPath} --output ${outputDir} --clean`, {
    timeout: 60_000,
  })

  const configVideos = fs
    .readdirSync(outputDir)
    .filter((f) => f.endsWith('.webm') && f.startsWith('parity-def'))
  expect(configVideos.length).toBeGreaterThan(0)

  const configDuration = getVideoDuration(path.join(outputDir, configVideos[0]))

  // ── Compare ─────────────────────────────────────────────────────────
  const delta = Math.abs(pwDuration - configDuration)
  console.log(
    `Duration — playwright: ${pwDuration.toFixed(2)}s, config: ${configDuration.toFixed(2)}s, delta: ${delta.toFixed(2)}s`,
  )
  expect(delta).toBeLessThan(2.0)
})
