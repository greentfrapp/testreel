import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { Browser } from 'playwright-core'
import {
  compositeScreenshot,
  renderBackground,
  renderRoundedMask,
  renderWindowFrame,
} from './chrome-renderer'
import { CURSOR_STYLES, getCursorPng } from './cursors'
import { getFFmpegPath } from './ffmpeg'
import {
  type RippleConfig,
  VP9_FAST_FLAGS,
  buildFilterGraph,
  buildPositionExpr,
  buildStyleExpr,
  buildVisibilityExpr,
  buildZoomFilter,
  buildZoomSegments,
  runFFmpeg,
} from './post-process'
import type {
  BackgroundOptions,
  CursorEvent,
  CursorStyle,
  StepTiming,
  WindowChromeOptions,
} from './types'
import { buildFrameFilters } from './window-frame'

// ---------------------------------------------------------------------------
// Pipeline configuration
// ---------------------------------------------------------------------------

export interface PipelineConfig {
  videoPath: string
  cursor?: {
    events: CursorEvent[]
    defaultStyle: CursorStyle
    size: number
  }
  frame?: {
    chrome?: WindowChromeOptions
    background?: BackgroundOptions
    videoWidth: number
    videoHeight: number
    screenshots?: string[]
    /** Scale factor to apply to the window (viewport + chrome) before compositing. Used by outputSize. */
    windowScale?: number
  }
  speed?: {
    stepTimings: StepTiming[]
    globalSpeed: number
  }
  /** When set, the final output is padded/cropped to exactly this size. */
  outputSize?: { width: number; height: number }
}

// ---------------------------------------------------------------------------
// Speed filter (pure)
// ---------------------------------------------------------------------------

/**
 * Build a setpts filter expression for speed adjustment.
 *
 * Supports both uniform speed (single setpts) and per-step piecewise
 * speed (nested if/between expression). Pure function — no I/O.
 */
export function buildSpeedFilter(
  inputLabel: string,
  stepTimings: StepTiming[],
  globalSpeed: number,
  outputLabel: string = 'speed_out',
): { filter: string; outputLabel: string } {
  const hasPerStep = stepTimings.some((t) => t.speed !== globalSpeed)

  if (!hasPerStep) {
    return {
      filter: `[${inputLabel}]setpts=PTS/${globalSpeed}[${outputLabel}]`,
      outputLabel,
    }
  }

  // Per-step speed — piecewise setpts expression
  const sorted = [...stepTimings].sort((a, b) => a.startTime - b.startTime)

  interface Segment {
    start: number
    end: number
    speed: number
  }
  const segments: Segment[] = []
  let cursor = 0

  for (const timing of sorted) {
    if (timing.startTime > cursor) {
      segments.push({
        start: cursor,
        end: timing.startTime,
        speed: globalSpeed,
      })
    }
    segments.push({
      start: timing.startTime,
      end: timing.endTime,
      speed: timing.speed,
    })
    cursor = timing.endTime
  }

  let accumulatedOutput = 0
  const segOutputOffsets: number[] = []
  for (const seg of segments) {
    segOutputOffsets.push(accumulatedOutput)
    accumulatedOutput += (seg.end - seg.start) / seg.speed
  }

  const C = '\\,'

  // Fallback for time beyond all segments
  let expr = `(${accumulatedOutput.toFixed(6)}+(T-${cursor.toFixed(6)})/${globalSpeed.toFixed(6)})/TB`

  // Build from last segment to first
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]
    const outOffset = segOutputOffsets[i].toFixed(6)
    const segStart = seg.start.toFixed(6)
    const segEnd = seg.end.toFixed(6)
    const segSpeed = seg.speed.toFixed(6)
    expr = `if(between(T${C}${segStart}${C}${segEnd})${C}(${outOffset}+(T-${segStart})/${segSpeed})/TB${C}${expr})`
  }

  return {
    filter: `[${inputLabel}]setpts=${expr}[${outputLabel}]`,
    outputLabel,
  }
}

// ---------------------------------------------------------------------------
// Post-processing pipeline (single FFmpeg pass)
// ---------------------------------------------------------------------------

/**
 * Run all post-processing stages (cursor overlay, window frame/background,
 * speed adjustment) in a single FFmpeg invocation.
 *
 * Each stage is conditionally included. The filter graph chains them:
 *   [0:v] → cursor filters → frame filters → setpts → [pipeline_out]
 *
 * Audio is copied when no speed adjustment is active, dropped otherwise
 * (setpts changes timing, making the audio track out of sync).
 *
 * Screenshot compositing (Playwright, not FFmpeg) runs after the video
 * pass if frame options include screenshots.
 */
export async function runPostProcessPipeline(
  config: PipelineConfig,
): Promise<string> {
  const { videoPath, cursor, frame, speed } = config

  if (!cursor && !frame && !speed) return videoPath

  const ext = path.extname(videoPath)
  const base = path.basename(videoPath, ext)
  const outputDir = path.dirname(videoPath)
  const outputPath = path.join(outputDir, `${base}-processed${ext}`)

  // Probe main video duration to limit output (prevents infinite streams from looped PNGs)
  const ffmpegBin = await getFFmpegPath()
  const probeDuration = await new Promise<number | null>((resolve) => {
    execFile(
      ffmpegBin,
      ['-i', videoPath, '-f', 'null', '-'],
      { timeout: 10000 },
      (_err, _stdout, stderr) => {
        const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
        if (match) {
          resolve(
            parseInt(match[1]) * 3600 +
              parseInt(match[2]) * 60 +
              parseFloat(match[3]),
          )
        } else {
          resolve(null)
        }
      },
    )
  })

  const inputArgs: string[] = ['-i', videoPath]
  let inputCount = 1
  const filterSegments: string[] = []
  let currentLabel = '0:v'
  const tempFiles: string[] = []
  let browser: Browser | undefined

  // Frame PNG paths — declared here so screenshot compositing can access them
  let framePngPath: string | undefined
  let bgPngPath: string | undefined
  let maskPngPath: string | undefined

  try {
    // -----------------------------------------------------------------
    // Stage 1: Cursor overlay
    // -----------------------------------------------------------------
    if (cursor) {
      // Determine which cursor styles are actually used
      const usedStyles = new Set<CursorStyle>([cursor.defaultStyle])
      for (const ev of cursor.events) {
        if (ev.cursorStyle) usedStyles.add(ev.cursorStyle)
      }
      // Load only used cursor style PNGs as inputs
      const cursorInputs: Array<{ style: CursorStyle; inputIdx: number }> = []
      for (const style of CURSOR_STYLES) {
        if (!usedStyles.has(style)) continue
        inputArgs.push('-i', getCursorPng(style))
        cursorInputs.push({ style, inputIdx: inputCount++ })
      }

      // Build position/visibility expressions
      const moveEvents = cursor.events.filter((e) => e.type === 'move')
      const keyframes = moveEvents.map((e) => ({
        time: e.time,
        x: e.x,
        y: e.y,
        transitionMs: e.transitionMs ?? 350,
      }))
      const xKeyframes = keyframes.map((k) => ({
        time: k.time,
        value: k.x,
        transitionMs: k.transitionMs,
      }))
      const yKeyframes = keyframes.map((k) => ({
        time: k.time,
        value: k.y,
        transitionMs: k.transitionMs,
      }))
      const xExpr = buildPositionExpr(xKeyframes, 'x')
      const yExpr = buildPositionExpr(yKeyframes, 'y')
      const visExpr = buildVisibilityExpr(cursor.events)

      // Ripple config (inline lavfi source, no extra inputs)
      const rippleEvents = cursor.events.filter((e) => e.type === 'ripple')
      let rippleConfig: RippleConfig | null = null
      if (rippleEvents.length > 0) {
        const rippleSize = rippleEvents[0].rippleSize ?? 100
        const rippleColor = rippleEvents[0].rippleColor ?? 'rgba(0, 0, 0, 0.4)'
        const match = rippleColor.match(
          /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/,
        )
        rippleConfig = {
          size: rippleSize,
          r: match ? parseInt(match[1]) : 59,
          g: match ? parseInt(match[2]) : 130,
          b: match ? parseInt(match[3]) : 246,
          baseAlpha: match && match[4] ? parseFloat(match[4]) : 0.4,
          durationMs: 500,
        }
      }

      // Build per-style enable expressions (only for used styles)
      const styleExprs: Record<string, string> = {}
      for (const { style } of cursorInputs) {
        styleExprs[style] = buildStyleExpr(
          cursor.events,
          style,
          cursor.defaultStyle,
        )
      }

      // Build discrete zoom segments for cursor scaling.
      // When FFmpeg zoom is active (frame compositing + zoom events with tx/ty),
      // skip cursor zoom scaling — the FFmpeg crop+scale will scale everything.
      const hasFFmpegZoom =
        frame &&
        cursor.events.some((e) => e.type === 'zoom' && e.zoomTx !== undefined)
      const zoomSegments = hasFFmpegZoom
        ? [{ cursorSize: cursor.size, enableExpr: '1' }]
        : buildZoomSegments(cursor.events, cursor.size)

      const cursorOutputLabel = frame || speed ? 'cur_out' : 'pipeline_out'

      const { filterGraph, extraInputArgs } = buildFilterGraph({
        cursorSize: cursor.size,
        zoomSegments,
        xExpr,
        yExpr,
        visExpr,
        rippleEvents,
        rippleConfig,
        videoLabel: currentLabel,
        outputLabel: cursorOutputLabel,
        multiCursor: {
          inputs: cursorInputs,
          styleExprs,
        },
      })

      inputArgs.push(...extraInputArgs)
      filterSegments.push(filterGraph)
      currentLabel = cursorOutputLabel
    }

    // -----------------------------------------------------------------
    // Stage 2: Window chrome / background
    // -----------------------------------------------------------------
    // Frame geometry — hoisted so Stage 2.5 (zoom) can access them
    let frameFinalW = 0
    let frameFinalH = 0
    let frameOverlayX = 0
    let frameOverlayY = 0
    let frameTitleBarHeight = 0
    let frameHasChrome = false
    let frameScaledVideoW = 0
    let frameScaledVideoH = 0

    if (frame) {
      const hasChrome = !!frame.chrome
      const hasBackground = !!frame.background
      frameHasChrome = hasChrome

      const ws = frame.windowScale ?? 1
      const titleBarHeight = Math.round(
        (frame.chrome?.titleBarHeight ?? 38) * ws,
      )
      frameTitleBarHeight = titleBarHeight
      const titleBarColor = frame.chrome?.titleBarColor ?? '#e8e8e8'
      const trafficLights = frame.chrome?.trafficLights ?? true
      const bgColor = frame.background?.color
      const bgGradient =
        frame.background?.gradient ??
        (bgColor ? undefined : { from: '#6366f1', to: '#a855f7' })
      const padding = frame.background?.padding ?? 60
      const borderRadius = Math.round(
        (frame.background?.borderRadius ?? 12) * ws,
      )

      const scaledVideoW = Math.round(frame.videoWidth * ws)
      const scaledVideoH = Math.round(frame.videoHeight * ws)
      frameScaledVideoW = scaledVideoW
      frameScaledVideoH = scaledVideoH
      const framedW = scaledVideoW
      const framedH = scaledVideoH + (hasChrome ? titleBarHeight : 0)
      // Use outputSize for background dimensions if specified, otherwise
      // compute from window + padding as before.
      const outputSize = config.outputSize
      const finalW =
        outputSize?.width ?? (hasBackground ? framedW + padding * 2 : framedW)
      const finalH =
        outputSize?.height ?? (hasBackground ? framedH + padding * 2 : framedH)
      frameFinalW = finalW
      frameFinalH = finalH
      // Compute centering offsets for the overlay
      const overlayX = Math.round((finalW - framedW) / 2)
      const overlayY = Math.round((finalH - framedH) / 2)
      frameOverlayX = overlayX
      frameOverlayY = overlayY

      // Scale the video down if windowScale < 1
      if (ws < 1) {
        filterSegments.push(
          `[${currentLabel}]scale=${scaledVideoW}:${scaledVideoH}:flags=lanczos[scaled_vid]`,
        )
        currentLabel = 'scaled_vid'
      }
      // Launch browser to render frame PNGs
      const { chromium } = await import('playwright-core')
      browser = await chromium.launch({ headless: true })

      if (hasChrome) {
        const urlText =
          typeof frame.chrome?.url === 'string' ? frame.chrome.url : undefined
        framePngPath = await renderWindowFrame(
          {
            width: framedW,
            height: framedH,
            titleBarHeight,
            titleBarColor,
            trafficLights,
            borderRadius: hasBackground ? borderRadius : 0,
            urlText,
          },
          browser,
        )
        tempFiles.push(framePngPath)
      }

      if (hasBackground) {
        bgPngPath = await renderBackground(
          {
            totalWidth: finalW,
            totalHeight: finalH,
            windowWidth: framedW,
            windowHeight: framedH,
            padding,
            borderRadius,
            background: bgGradient
              ? { type: 'gradient', from: bgGradient.from, to: bgGradient.to }
              : { type: 'solid', color: bgColor ?? '#6366f1' },
          },
          browser,
        )
        tempFiles.push(bgPngPath)

        if (borderRadius > 0) {
          maskPngPath = await renderRoundedMask(
            {
              width: framedW,
              height: framedH,
              borderRadius,
            },
            browser,
          )
          tempFiles.push(maskPngPath)
        }
      }

      // Check if FFmpeg zoom stage will follow
      const hasZoomEvents =
        cursor &&
        cursor.events.some((e) => e.type === 'zoom' && e.zoomTx !== undefined)
      const frameOutputLabel =
        speed || hasZoomEvents ? 'frm_out' : 'pipeline_out'

      const { filters, extraInputArgs, nextInputIndex } = buildFrameFilters({
        inputLabel: currentLabel,
        inputIndexStart: inputCount,
        chrome: hasChrome
          ? { ...frame.chrome, titleBarHeight, titleBarColor }
          : undefined,
        background: hasBackground
          ? { ...frame.background, padding, borderRadius }
          : undefined,
        framePngPath,
        bgPngPath,
        maskPngPath,
        overlayX,
        overlayY,
        outputLabel: frameOutputLabel,
      })

      inputCount = nextInputIndex
      inputArgs.push(...extraInputArgs)
      filterSegments.push(filters.join(';'))
      currentLabel = frameOutputLabel

      // --- Screenshot compositing (Playwright, not FFmpeg) ---
      if (
        frame.screenshots &&
        frame.screenshots.length > 0 &&
        framePngPath &&
        bgPngPath
      ) {
        for (const ssPath of frame.screenshots) {
          if (!fs.existsSync(ssPath)) continue
          await compositeScreenshot(
            {
              screenshotPath: ssPath,
              framePngPath,
              bgPngPath,
              totalWidth: finalW,
              totalHeight: finalH,
              padding: overlayX,
              titleBarHeight,
              borderRadius,
            },
            browser,
          )
        }
      }
    }

    // -----------------------------------------------------------------
    // Stage 2.5: Full-frame zoom (crop + scale on composited frame)
    // -----------------------------------------------------------------
    if (frame && cursor) {
      const zoomInput = {
        events: cursor.events,
        frameWidth: frameFinalW,
        frameHeight: frameFinalH,
        pageOffsetX: frameOverlayX,
        pageOffsetY: frameOverlayY + (frameHasChrome ? frameTitleBarHeight : 0),
        pageWidth: frameScaledVideoW,
        pageHeight: frameScaledVideoH,
      }
      console.error(
        `  zoom filter input: ${frameFinalW}x${frameFinalH}, pageOffset=(${frameOverlayX},${zoomInput.pageOffsetY}), page=${frameScaledVideoW}x${frameScaledVideoH}`,
      )
      const zoomResult = buildZoomFilter(
        zoomInput,
        currentLabel,
        speed ? 'zoom_out' : 'pipeline_out',
      )
      console.error(
        `  zoom filter result: ${zoomResult ? 'generated (' + zoomResult.filter.length + ' chars)' : 'null'}`,
      )
      if (zoomResult) {
        filterSegments.push(zoomResult.filter)
        currentLabel = zoomResult.outputLabel
      }
    }

    // -----------------------------------------------------------------
    // Stage 3: Speed adjustment
    // -----------------------------------------------------------------
    if (speed) {
      const { filter } = buildSpeedFilter(
        currentLabel,
        speed.stepTimings,
        speed.globalSpeed,
        'pipeline_out',
      )
      filterSegments.push(filter)
      currentLabel = 'pipeline_out'
    }

    // -----------------------------------------------------------------
    // Run single FFmpeg invocation
    // -----------------------------------------------------------------
    const filterGraph = filterSegments.join(';')
    // Debug: save filter graph for inspection
    const debugFilterPath = path.join(outputDir, 'debug-filter.txt')
    fs.writeFileSync(debugFilterPath, filterGraph)
    console.error('  filter graph saved to:', debugFilterPath)
    const filterScriptPath = path.join(
      os.tmpdir(),
      `testreel-pipeline-${Date.now()}.txt`,
    )
    fs.writeFileSync(filterScriptPath, filterGraph)
    tempFiles.push(filterScriptPath)

    // Drop audio when speed is active (timing would be wrong)
    const audioArgs = speed ? ['-an'] : ['-map', '0:a?', '-c:a', 'copy']

    await runFFmpeg([
      ...inputArgs,
      '-filter_complex_script',
      filterScriptPath,
      '-map',
      `[${currentLabel}]`,
      ...audioArgs,
      '-c:v',
      'libvpx-vp9',
      ...VP9_FAST_FLAGS,
      ...(probeDuration ? ['-t', String(probeDuration)] : []),
      '-y',
      outputPath,
    ])
  } finally {
    if (browser) await browser.close()
    for (const f of tempFiles) {
      try {
        fs.unlinkSync(f)
      } catch {}
    }
  }

  return outputPath
}
