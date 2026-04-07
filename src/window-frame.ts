import { hexToFFmpeg } from './drawing'
import type { BackgroundOptions, WindowChromeOptions } from './types'

// ---------------------------------------------------------------------------
// Pure filter-graph construction for frame overlay
// ---------------------------------------------------------------------------

export interface FrameFilterInput {
  inputLabel: string
  inputIndexStart: number
  chrome?: WindowChromeOptions
  background?: BackgroundOptions
  framePngPath?: string
  bgPngPath?: string
  maskPngPath?: string
  /** X offset for centering the window on the background. Defaults to padding. */
  overlayX?: number
  /** Y offset for centering the window on the background. Defaults to padding. */
  overlayY?: number
  outputLabel?: string
}

export interface FrameFilterOutput {
  filters: string[]
  extraInputArgs: string[]
  outputLabel: string
  nextInputIndex: number
}

/**
 * Build FFmpeg filter graph fragments for window chrome and background.
 *
 * Pure function — no I/O. The caller renders PNGs (via Playwright) and
 * passes their paths in. Returns filters and extra -i args to splice
 * into an FFmpeg invocation.
 */
export function buildFrameFilters(input: FrameFilterInput): FrameFilterOutput {
  const {
    inputLabel,
    inputIndexStart,
    chrome,
    background,
    framePngPath,
    bgPngPath,
    maskPngPath,
    outputLabel = 'frame_out',
  } = input
  const hasChrome = !!chrome
  const hasBackground = !!background

  if (!hasChrome && !hasBackground) {
    return {
      filters: [],
      extraInputArgs: [],
      outputLabel: inputLabel,
      nextInputIndex: inputIndexStart,
    }
  }

  const filters: string[] = []
  const extraInputArgs: string[] = []
  let currentLabel = inputLabel
  let inputCount = inputIndexStart

  const titleBarHeight = chrome?.titleBarHeight ?? 38
  const titleBarColor = chrome?.titleBarColor ?? '#e8e8e8'
  const padding = background?.padding ?? 60
  const borderRadius = background?.borderRadius ?? 12

  // --- Title bar + frame overlay ---
  if (hasChrome && framePngPath) {
    filters.push(
      `[${currentLabel}]pad=iw:ih+${titleBarHeight}:0:${titleBarHeight}:${hexToFFmpeg(titleBarColor)}[padded]`,
    )
    currentLabel = 'padded'

    extraInputArgs.push('-i', framePngPath)
    const frameInputIdx = inputCount++

    filters.push(
      `[${currentLabel}][${frameInputIdx}:v]overlay=0:0:format=auto[chromed]`,
    )
    currentLabel = 'chromed'
  }

  // --- Rounded corners + background ---
  if (hasBackground && bgPngPath) {
    extraInputArgs.push('-loop', '1', '-i', bgPngPath)
    const bgInputIdx = inputCount++

    if (borderRadius > 0 && maskPngPath) {
      extraInputArgs.push('-loop', '1', '-i', maskPngPath)
      const maskInputIdx = inputCount++

      filters.push(
        `[${currentLabel}]format=yuva420p[chromed_a]`,
        `[${maskInputIdx}:v]format=gray[mask]`,
        `[chromed_a][mask]alphamerge[rounded]`,
      )
      currentLabel = 'rounded'
    }

    const ox = input.overlayX ?? padding
    const oy = input.overlayY ?? padding
    filters.push(
      `[${bgInputIdx}:v][${currentLabel}]overlay=${ox}:${oy}:shortest=1:format=auto[${outputLabel}]`,
    )
    currentLabel = outputLabel
  } else {
    // No background — rename last filter's output to the desired label
    const lastFilter = filters[filters.length - 1]
    filters[filters.length - 1] = lastFilter.replace(
      /\[[^\]]+\]$/,
      `[${outputLabel}]`,
    )
    currentLabel = outputLabel
  }

  return {
    filters,
    extraInputArgs,
    outputLabel: currentLabel,
    nextInputIndex: inputCount,
  }
}
