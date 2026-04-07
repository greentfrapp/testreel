import fs from 'fs'
import path from 'path'
import type { BackgroundOptions, Viewport, WindowChromeOptions } from './types'

const TESTREEL_OUTPUT_EXTENSIONS = new Set([
  '.webm',
  '.mp4',
  '.gif',
  '.png',
  '.json',
])

/** Remove previous testreel output files (videos, screenshots, manifests) from a directory. */
export function cleanOutputDir(dir: string): void {
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase()
    if (TESTREEL_OUTPUT_EXTENSIONS.has(ext)) {
      try {
        fs.unlinkSync(path.join(dir, entry))
      } catch {
        // ignore — file may be in use
      }
    }
  }
}

export function timestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}-${ms}`
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export interface OutputSizeResult {
  /** Padding to use (may be larger than minPadding to fill outputSize). */
  padding: number
  /** Scale factor to apply to the window (viewport + chrome) if it doesn't fit. 1 = no scaling. */
  windowScale: number
}

/**
 * Given a desired output size, viewport, chrome, and minimum padding,
 * compute the padding and window scale needed.
 *
 * - If the window fits within outputSize with minPadding to spare, padding
 *   is increased evenly to fill the gap.
 * - If the window is too large, it's scaled down (preserving aspect ratio)
 *   to fit within outputSize minus 2×minPadding.
 */
export function computeOutputSizeLayout(
  outputSize: Viewport,
  viewport: Viewport,
  chrome?: boolean | WindowChromeOptions,
  background?: boolean | BackgroundOptions,
): OutputSizeResult {
  const hasChrome =
    chrome === true || (typeof chrome === 'object' && chrome.enabled !== false)

  const titleBarHeight = hasChrome
    ? ((typeof chrome === 'object' ? chrome.titleBarHeight : undefined) ?? 38)
    : 0

  const minPadding =
    typeof background === 'object' ? (background.padding ?? 60) : 60

  // Window = viewport + chrome title bar
  const windowW = viewport.width
  const windowH = viewport.height + titleBarHeight

  // Available space inside output after minimum padding
  const availW = outputSize.width - minPadding * 2
  const availH = outputSize.height - minPadding * 2

  if (windowW <= availW && windowH <= availH) {
    // Window fits — distribute extra space as padding
    const extraW = (availW - windowW) / 2
    const extraH = (availH - windowH) / 2
    const uniformExtra = Math.min(extraW, extraH)
    return {
      padding: minPadding + uniformExtra,
      windowScale: 1,
    }
  }

  // Window too large — scale it down to fit
  const scaleW = availW / windowW
  const scaleH = availH / windowH
  const windowScale = Math.min(scaleW, scaleH)

  return {
    padding: minPadding,
    windowScale,
  }
}
