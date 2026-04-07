/**
 * End-to-end smoke test for action handlers against a real browser.
 *
 * Drives an inline HTML page through click/fill/type/hover/scroll/keyboard
 * /wait actions and asserts the recording completes successfully.
 *
 * Run:
 *   pnpm exec playwright test --config tests/integration/playwright.config.ts playwright-actions-e2e
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const cli = path.resolve('dist/cli.cjs')

const HTML = `<!doctype html>
<html><head><title>actions</title></head>
<body style="margin:0;font:16px sans-serif">
  <button id="btn" onclick="document.getElementById('out').textContent='clicked'">Click me</button>
  <input id="fillable" type="text" />
  <input id="typeable" type="text" />
  <div id="hovertarget" style="width:120px;height:40px;background:#ddd">hover me</div>
  <div id="out"></div>
  <div id="scroller" style="height:2000px;background:linear-gradient(#fff,#000)"></div>
</body></html>`

const INLINE_URL = 'data:text/html,' + encodeURIComponent(HTML)

test.describe('actions end-to-end', () => {
  const outDir = path.resolve('test-results/actions-e2e-test')

  test.beforeAll(() => {
    fs.rmSync(outDir, { recursive: true, force: true })
    fs.mkdirSync(outDir, { recursive: true })
  })

  test('runs click/fill/type/hover/scroll/keyboard/wait against a real page', () => {
    const defPath = path.join(outDir, 'def.json')
    fs.writeFileSync(
      defPath,
      JSON.stringify({
        url: INLINE_URL,
        viewport: { width: 640, height: 480 },
        steps: [
          { action: 'wait', ms: 200 },
          { action: 'click', selector: '#btn' },
          { action: 'fill', selector: '#fillable', text: 'filled value' },
          { action: 'hover', selector: '#hovertarget' },
          { action: 'type', selector: '#typeable', text: 'hi' },
          { action: 'keyboard', key: 'Tab' },
          { action: 'scroll', selector: '#scroller' },
          { action: 'wait', ms: 200 },
        ],
      }),
    )

    const result = execSync(
      `node ${cli} ${defPath} --output ${outDir} --clean`,
      { timeout: 120_000, stdio: 'pipe' },
    )
    expect(result).toBeDefined()

    const webms = fs.readdirSync(outDir).filter((f) => f.endsWith('.webm'))
    expect(webms.length).toBeGreaterThan(0)
    expect(fs.statSync(path.join(outDir, webms[0])).size).toBeGreaterThan(0)

    const manifestPath = path.join(outDir, 'output.json')
    expect(fs.existsSync(manifestPath)).toBe(true)
  })
})
