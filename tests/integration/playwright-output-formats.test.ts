/**
 * Integration test for output formats (webm, mp4, gif).
 *
 * Drives the CLI end-to-end against a tiny inline data: URL and verifies
 * each produced file exists, is non-empty, and starts with the expected
 * magic bytes for its container format.
 *
 * Run:
 *   pnpm exec playwright test --config tests/integration/playwright.config.ts playwright-output-formats
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const cli = path.resolve('dist/cli.cjs')

// Tiny self-contained page — no network, deterministic, fast.
const INLINE_URL =
  'data:text/html,' +
  encodeURIComponent(
    '<!doctype html><title>t</title><body style="background:#222;color:#fff;font:24px sans-serif;margin:40px">hello</body>',
  )

function startsWith(buf: Buffer, bytes: number[]): boolean {
  if (buf.length < bytes.length) return false
  for (let i = 0; i < bytes.length; i++) {
    if (buf[i] !== bytes[i]) return false
  }
  return true
}

function sniff(filePath: string): 'webm' | 'mp4' | 'gif' | 'unknown' {
  const buf = fs.readFileSync(filePath, { encoding: null }).subarray(0, 16)
  // EBML header — webm/matroska
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return 'webm'
  // ISO BMFF: bytes 4..8 == "ftyp"
  if (
    buf.length >= 8 &&
    buf[4] === 0x66 &&
    buf[5] === 0x74 &&
    buf[6] === 0x79 &&
    buf[7] === 0x70
  )
    return 'mp4'
  // "GIF8"
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return 'gif'
  return 'unknown'
}

test.describe('output formats', () => {
  const baseDir = path.resolve('test-results/output-formats-test')

  test.beforeAll(() => {
    fs.rmSync(baseDir, { recursive: true, force: true })
    fs.mkdirSync(baseDir, { recursive: true })
  })

  for (const { format, ext } of [
    { format: 'webm', ext: 'webm' },
    { format: 'mp4', ext: 'mp4' },
    { format: 'gif', ext: 'gif' },
  ] as const) {
    test(`produces a valid .${ext} file with --format ${format}`, () => {
      const outDir = path.join(baseDir, format)
      fs.mkdirSync(outDir, { recursive: true })

      const defPath = path.join(outDir, 'def.json')
      fs.writeFileSync(
        defPath,
        JSON.stringify({
          url: INLINE_URL,
          viewport: { width: 480, height: 320 },
          steps: [{ action: 'wait', ms: 500 }],
        }),
      )

      execSync(
        `node ${cli} ${defPath} --output ${outDir} --format ${format} --clean`,
        { timeout: 90_000, stdio: 'pipe' },
      )

      const files = fs.readdirSync(outDir).filter((f) => f.endsWith(`.${ext}`))
      expect(files.length).toBeGreaterThan(0)

      const filePath = path.join(outDir, files[0])
      const stat = fs.statSync(filePath)
      expect(stat.size).toBeGreaterThan(0)

      expect(sniff(filePath)).toBe(format)
    })
  }
})
