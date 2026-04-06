import fs from 'fs'
import os from 'os'
import path from 'path'
import { runFFmpeg } from './ffmpeg'
import type { CursorEvent, CursorStyle } from './types'

/** Shared VP9 encoding flags optimized for speed with screen content. */
export const VP9_FAST_FLAGS = [
  '-crf',
  '24',
  '-b:v',
  '0',
  '-deadline',
  'realtime',
  '-cpu-used',
  '8',
  '-row-mt',
  '1',
  '-threads',
  '0',
] as const

export { runFFmpeg } from './ffmpeg'

/** Base size of bundled cursor PNGs (100×100 high-res source). */
const CURSOR_BASE_SIZE = 100

/**
 * Cursor hotspot offset as a fraction of cursor size.
 * (0, 0) = top-left (arrow cursors), (0.5, 0.5) = center (touch cursor).
 */
export const CURSOR_HOTSPOT: Record<string, { x: number; y: number }> = {
  default: { x: 0, y: 0 },
  pointer: { x: 0.38, y: 0.2 },
  text: { x: 0.5, y: 0.5 },
  touch: { x: 0.5, y: 0.5 },
}

/**
 * Build FFmpeg piecewise-linear expression for cursor position.
 *
 * Given keyframes [(t0,v0), (t1,v1), ...], produces an expression that:
 * - Before first keyframe: returns first value
 * - Between keyframes: linearly interpolates over transitionMs
 * - After last keyframe: returns last value
 */
export function buildPositionExpr(
  keyframes: Array<{ time: number; value: number; transitionMs: number }>,
  axis: 'x' | 'y',
): string {
  if (keyframes.length === 0) return '0'
  if (keyframes.length === 1) return String(keyframes[0].value)

  // Build nested if/else expression
  // For each segment: cursor starts moving at event time, arrives at event time + duration
  let expr = String(keyframes[keyframes.length - 1].value)

  for (let i = keyframes.length - 1; i >= 1; i--) {
    const prev = keyframes[i - 1]
    const curr = keyframes[i]
    const durSec = curr.transitionMs / 1000
    const moveStart = curr.time // cursor starts moving when event was recorded
    const arrivalTime = moveStart + durSec // cursor arrives after transition

    // During transition: lerp from prev.value to curr.value
    const lerp = `${prev.value}+(${curr.value}-${prev.value})*(t-${moveStart.toFixed(4)})/${durSec.toFixed(4)}`
    // Before the transition start: use prev value
    expr = `if(lt(t,${moveStart.toFixed(4)}),${prev.value},if(lt(t,${arrivalTime.toFixed(4)}),${lerp},${expr}))`
  }

  return expr
}

/**
 * Build FFmpeg expression for cursor visibility (opacity).
 * Returns '1' when visible, '0' when hidden.
 */
export function buildVisibilityExpr(events: CursorEvent[]): string {
  const visEvents = events.filter((e) => e.type === 'hide' || e.type === 'show')
  if (visEvents.length === 0) return '1'

  const lastVal = visEvents[visEvents.length - 1].type === 'hide' ? '0' : '1'
  let result = lastVal

  for (let i = visEvents.length - 2; i >= 0; i--) {
    const val = visEvents[i].type === 'hide' ? '0' : '1'
    result = `if(lt(t,${visEvents[i + 1].time.toFixed(4)}),${val},${result})`
  }

  result = `if(lt(t,${visEvents[0].time.toFixed(4)}),1,${result})`

  return result
}

/**
 * Build FFmpeg expression for cursor style switching.
 * Returns '1' when the active cursor style matches `targetStyle`, '0' otherwise.
 * Scans move events to determine which style is active at each time segment.
 */
export function buildStyleExpr(
  events: CursorEvent[],
  targetStyle: CursorStyle,
  defaultStyle: CursorStyle,
): string {
  const moveEvents = events.filter(
    (e) => e.type === 'move' && e.cursorStyle !== undefined,
  )

  // No style info at all — use default
  if (moveEvents.length === 0) {
    return defaultStyle === targetStyle ? '1' : '0'
  }

  // Build segments: before first move uses defaultStyle, then each move sets the style
  const segments: Array<{ time: number; active: boolean }> = []

  // Before first move event
  segments.push({ time: 0, active: defaultStyle === targetStyle })

  for (const ev of moveEvents) {
    segments.push({
      time: ev.time,
      active: (ev.cursorStyle ?? defaultStyle) === targetStyle,
    })
  }

  // Collapse consecutive segments with the same value
  const collapsed: Array<{ time: number; active: boolean }> = [segments[0]]
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].active !== collapsed[collapsed.length - 1].active) {
      collapsed.push(segments[i])
    }
  }

  // If only one segment, return constant
  if (collapsed.length === 1) {
    return collapsed[0].active ? '1' : '0'
  }

  // Build nested if expression from the end
  let expr = collapsed[collapsed.length - 1].active ? '1' : '0'
  for (let i = collapsed.length - 2; i >= 0; i--) {
    const val = collapsed[i].active ? '1' : '0'
    const boundary = collapsed[i + 1].time.toFixed(4)
    expr = `if(lt(t,${boundary}),${val},${expr})`
  }

  return expr
}

export interface ZoomSegment {
  /** Cursor pixel size for this segment. */
  cursorSize: number
  /** FFmpeg enable expression: '1' when this zoom level is active. */
  enableExpr: string
}

/**
 * Build discrete zoom segments for cursor scaling.
 * Returns one segment per zoom level, each with a pre-computed cursor size
 * and an FFmpeg enable expression for when that zoom level is active.
 * Uses discrete switching (at the midpoint of the zoom transition) since
 * FFmpeg's scale filter doesn't support time-based expressions.
 */
/** Number of intermediate steps to approximate smooth cursor scaling during zoom. */
const ZOOM_INTERPOLATION_STEPS = 6

export function buildZoomSegments(
  events: CursorEvent[],
  baseCursorSize: number,
): ZoomSegment[] {
  const zoomEvents = events.filter(
    (e) => e.type === 'zoom' && e.zoomScale !== undefined,
  )

  // No zoom events — single segment at base size
  if (zoomEvents.length === 0) {
    return [{ cursorSize: baseCursorSize, enableExpr: '1' }]
  }

  // Build time ranges with interpolated intermediate steps during transitions
  interface TimeRange {
    start: number
    end: number
  }
  const sizeRanges = new Map<number, TimeRange[]>()

  const addRange = (size: number, start: number, end: number) => {
    if (end <= start) return
    if (!sizeRanges.has(size)) sizeRanges.set(size, [])
    sizeRanges.get(size)!.push({ start, end })
  }

  let currentScale = 1
  let currentTime = 0

  for (const ev of zoomEvents) {
    const durationSec = (ev.zoomDurationMs ?? 600) / 1000
    const transStart = ev.time
    const transEnd = ev.time + durationSec
    const fromScale = currentScale
    const toScale = ev.zoomScale!

    // Static segment before this transition
    addRange(Math.round(baseCursorSize * fromScale), currentTime, transStart)

    // Interpolated steps during the transition
    const steps = ZOOM_INTERPOLATION_STEPS
    for (let i = 0; i < steps; i++) {
      const t0 = transStart + (i / steps) * durationSec
      const t1 = transStart + ((i + 1) / steps) * durationSec
      const midT = (i + 0.5) / steps // normalized midpoint for interpolation
      const interpScale = fromScale + (toScale - fromScale) * midT
      addRange(Math.round(baseCursorSize * interpScale), t0, t1)
    }

    currentScale = toScale
    currentTime = transEnd
  }
  // Final segment extends to very large time
  addRange(Math.round(baseCursorSize * currentScale), currentTime, 99999)

  // Build enable expressions per cursor size
  const segments: ZoomSegment[] = []
  for (const [cursorSize, ranges] of sizeRanges) {
    const parts = ranges.map(
      (r) => `between(t\\,${r.start.toFixed(4)}\\,${r.end.toFixed(4)})`,
    )
    const enableExpr = parts.length === 1 ? parts[0] : parts.join('+')
    segments.push({ cursorSize, enableExpr })
  }

  return segments
}

// ---------------------------------------------------------------------------
// Full-frame zoom filter (scale + crop on composited frame)
// ---------------------------------------------------------------------------

export interface ZoomFilterInput {
  events: CursorEvent[]
  /** Composited frame dimensions (after window/background compositing) */
  frameWidth: number
  frameHeight: number
  /** Offset of the page video within the composited frame */
  pageOffsetX: number
  pageOffsetY: number
  /** Page viewport dimensions */
  pageWidth: number
  pageHeight: number
}

/**
 * Build a time-varying FFmpeg scale+crop filter that zooms the entire
 * composited frame (page + window chrome + background) based on zoom events.
 *
 * Uses scale with eval=frame to dynamically resize the frame per-frame,
 * then crop with fixed output dimensions and per-frame x/y to select
 * the visible region. FFmpeg's crop filter only evaluates w/h once at
 * init, so time-varying dimensions are not possible — the scale filter
 * handles the zoom factor instead.
 *
 * Returns null when no zoom events carry translation data (zoomTx/zoomTy),
 * meaning FFmpeg zoom is not needed.
 */
export function buildZoomFilter(
  input: ZoomFilterInput,
  inputLabel: string,
  outputLabel: string,
): { filter: string; outputLabel: string } | null {
  const {
    events,
    frameWidth: fw,
    frameHeight: fh,
    pageOffsetX,
    pageOffsetY,
    pageWidth: pw,
    pageHeight: ph,
  } = input

  const zoomEvents = events.filter(
    (e) =>
      e.type === 'zoom' &&
      e.zoomScale !== undefined &&
      e.zoomTx !== undefined &&
      e.zoomTy !== undefined,
  )

  if (zoomEvents.length === 0) return null

  // Build keyframes for zoom factor and pan position.
  // Each zoom event defines a target state; we interpolate over zoomDurationMs.
  interface ZoomKeyframe {
    time: number // arrival time (end of transition)
    transitionMs: number
    zoom: number // scale factor (1 = no zoom, 2 = 2x zoom)
    panX: number // crop x position in the scaled-up frame
    panY: number // crop y position in the scaled-up frame
  }

  const keyframes: ZoomKeyframe[] = []
  for (const ev of zoomEvents) {
    const scale = ev.zoomScale!
    const tx = ev.zoomTx!
    const ty = ev.zoomTy!
    const durationMs = ev.zoomDurationMs ?? 600

    // Compute zoom center in composited frame coordinates
    const cfCenterX = pageOffsetX + (-tx + pw / (2 * scale))
    const cfCenterY = pageOffsetY + (-ty + ph / (2 * scale))

    // Pan position: center the crop on the zoom target in the scaled frame.
    // After scaling by z, the target is at (cfCenterX * z, cfCenterY * z).
    // Crop origin = target - halfOutput, clamped to valid range.
    const panX = Math.round(
      Math.max(0, Math.min(fw * scale - fw, cfCenterX * scale - fw / 2)),
    )
    const panY = Math.round(
      Math.max(0, Math.min(fh * scale - fh, cfCenterY * scale - fh / 2)),
    )

    keyframes.push({
      time: ev.time + durationMs / 1000,
      transitionMs: durationMs,
      zoom: scale,
      panX,
      panY,
    })
  }

  // Build piecewise linear expression (same approach as buildPositionExpr)
  function buildExpr(
    kfs: ZoomKeyframe[],
    field: 'zoom' | 'panX' | 'panY',
    defaultVal: number,
  ): string {
    if (kfs.length === 0) return String(defaultVal)

    let expr = String(kfs[kfs.length - 1][field])

    for (let i = kfs.length - 1; i >= 0; i--) {
      const curr = kfs[i]
      const prev = i > 0 ? kfs[i - 1] : null
      const prevVal = prev ? prev[field] : defaultVal
      const durSec = curr.transitionMs / 1000
      const arrivalTime = curr.time
      const moveStart = Math.max(0, arrivalTime - durSec)

      const lerp = `${prevVal}+(${curr[field]}-${prevVal})*(t-${moveStart.toFixed(4)})/${durSec.toFixed(4)}`
      expr = `if(lt(t,${moveStart.toFixed(4)}),${prevVal},if(lt(t,${arrivalTime.toFixed(4)}),${lerp},${expr}))`
    }

    return expr
  }

  const zoomExpr = buildExpr(keyframes, 'zoom', 1)
  const panXExpr = buildExpr(keyframes, 'panX', 0)
  const panYExpr = buildExpr(keyframes, 'panY', 0)

  // Scale up by zoom factor (eval=frame for per-frame dimensions),
  // then crop to original frame size with per-frame pan position.
  // trunc(val/2)*2 ensures even dimensions required by most codecs.
  const filter =
    `[${inputLabel}]scale=w='trunc(iw*(${zoomExpr})/2)*2':h='trunc(ih*(${zoomExpr})/2)*2':eval=frame:flags=lanczos` +
    `,crop=w=${fw}:h=${fh}:x='${panXExpr}':y='${panYExpr}'[${outputLabel}]`

  return { filter, outputLabel }
}

export interface RippleConfig {
  size: number
  r: number
  g: number
  b: number
  baseAlpha: number
  durationMs: number
}

export interface FilterGraphInput {
  cursorSize: number
  /** Discrete zoom segments for cursor scaling during zoom. */
  zoomSegments?: ZoomSegment[]
  xExpr: string
  yExpr: string
  visExpr: string
  rippleEvents: Array<{
    x: number
    y: number
    time: number
    rippleSize?: number
  }>
  rippleConfig: RippleConfig | null
}

export interface FilterGraphOutput {
  /** The complete FFmpeg filter_complex graph string */
  filterGraph: string
  /** Additional -i args beyond [-i video, -i cursor] (one per ripple event) */
  extraInputArgs: string[]
}

/**
 * Build the FFmpeg filter_complex graph string for cursor overlay.
 *
 * Pure function — no I/O. The caller is responsible for generating the
 * ripple clip and wiring up the FFmpeg invocation.
 *
 * Optional params allow the pipeline to offset input indices and labels
 * when chaining with other filter stages. Defaults preserve the original
 * standalone behavior.
 */
export function buildFilterGraph(
  input: FilterGraphInput & {
    videoLabel?: string
    cursorInputIdx?: number
    outputLabel?: string
    /** Multi-cursor support: overlay multiple cursor PNGs with per-style enable expressions. */
    multiCursor?: {
      inputs: Array<{ style: CursorStyle; inputIdx: number }>
      styleExprs: Record<string, string>
    }
  },
): FilterGraphOutput {
  const {
    cursorSize,
    zoomSegments,
    xExpr,
    yExpr,
    visExpr,
    rippleEvents,
    rippleConfig,
    videoLabel = '0:v',
    cursorInputIdx = 1,
    outputLabel = 'final_out',
    multiCursor,
  } = input
  const filters: string[] = []
  let currentInput = videoLabel
  const extraInputArgs: string[] = []

  // Determine effective zoom segments (default: single segment at base cursor size)
  const effectiveZoom =
    zoomSegments && zoomSegments.length > 1 ? zoomSegments : undefined

  if (multiCursor && multiCursor.inputs.length > 0) {
    if (effectiveZoom) {
      // Multi-cursor × multi-zoom: one overlay per (style × zoom) pair
      for (const { style, inputIdx } of multiCursor.inputs) {
        const styleExpr = multiCursor.styleExprs[style] ?? '0'
        const hotspot = CURSOR_HOTSPOT[style] ?? { x: 0, y: 0 }

        for (let z = 0; z < effectiveZoom.length; z++) {
          const zoom = effectiveZoom[z]
          const label = `cursor_${style}_z${z}`

          // Scale cursor to zoom-adjusted size
          let cursorLabel = `${inputIdx}:v`
          if (zoom.cursorSize !== CURSOR_BASE_SIZE) {
            const scaledLabel = `${label}_scaled`
            filters.push(
              `[${inputIdx}:v]scale=${zoom.cursorSize}:${zoom.cursorSize}:flags=lanczos[${scaledLabel}]`,
            )
            cursorLabel = scaledLabel
          }

          // Apply hotspot offset so the cursor's logical point aligns with (x, y)
          const xOff = Math.round(hotspot.x * zoom.cursorSize)
          const yOff = Math.round(hotspot.y * zoom.cursorSize)
          const adjX = xOff === 0 ? xExpr : `(${xExpr})-${xOff}`
          const adjY = yOff === 0 ? yExpr : `(${yExpr})-${yOff}`

          // Enable = visibility × style × zoom
          const enableExpr = `(${visExpr})*(${styleExpr})*(${zoom.enableExpr})`
          const outLabel = `${label}_out`

          filters.push(
            `[${currentInput}][${cursorLabel}]overlay=x='${adjX}':y='${adjY}':enable='${enableExpr}':format=auto[${outLabel}]`,
          )
          currentInput = outLabel
        }
      }
    } else {
      // Multi-cursor, no zoom: one overlay per style
      for (let i = 0; i < multiCursor.inputs.length; i++) {
        const { style, inputIdx } = multiCursor.inputs[i]
        const styleExpr = multiCursor.styleExprs[style] ?? '0'
        const hotspot = CURSOR_HOTSPOT[style] ?? { x: 0, y: 0 }

        let cursorLabel = `${inputIdx}:v`
        if (cursorSize !== CURSOR_BASE_SIZE) {
          const scaledLabel = `cursor_${style}_scaled`
          filters.push(
            `[${inputIdx}:v]scale=${cursorSize}:${cursorSize}:flags=lanczos[${scaledLabel}]`,
          )
          cursorLabel = scaledLabel
        }

        // Apply hotspot offset so the cursor's logical point aligns with (x, y)
        const xOff = Math.round(hotspot.x * cursorSize)
        const yOff = Math.round(hotspot.y * cursorSize)
        const adjX = xOff === 0 ? xExpr : `(${xExpr})-${xOff}`
        const adjY = yOff === 0 ? yExpr : `(${yExpr})-${yOff}`

        const enableExpr = `(${visExpr})*(${styleExpr})`
        const outLabel = `cursor_${style}_out`

        filters.push(
          `[${currentInput}][${cursorLabel}]overlay=x='${adjX}':y='${adjY}':enable='${enableExpr}':format=auto[${outLabel}]`,
        )
        currentInput = outLabel
      }
    }
  } else {
    // Single cursor (legacy path)
    let cursorLabel = `${cursorInputIdx}:v`
    if (cursorSize !== CURSOR_BASE_SIZE) {
      filters.push(
        `[${cursorInputIdx}:v]scale=${cursorSize}:${cursorSize}:flags=lanczos[cursor_scaled]`,
      )
      cursorLabel = 'cursor_scaled'
    }

    filters.push(
      `[${currentInput}][${cursorLabel}]overlay=x='${xExpr}':y='${yExpr}':enable='${visExpr}':format=auto[cursor_out]`,
    )
    currentInput = 'cursor_out'
  }

  // Add ripple overlays via inline lavfi source (no extra inputs needed)
  if (rippleEvents.length > 0 && rippleConfig && rippleConfig.size > 0) {
    const { size, r, g, b, baseAlpha, durationMs } = rippleConfig
    const fps = 30
    const frames = Math.ceil((durationMs / 1000) * fps)
    const dim = size * 2
    const alphaVal = Math.round(255 * baseAlpha)

    // Generate ripple animation as a lavfi source.
    // Draws an expanding ring that fades over time.
    const ringWidth = Math.max(4, Math.round(size * 0.15))
    const geq =
      `geq=` +
      `r='if(lte(hypot(X-${size},Y-${size}),${size}*(N+1)/${frames})*gt(hypot(X-${size},Y-${size}),(${size}*(N+1)/${frames})-${ringWidth}),${r},0)'` +
      `:g='if(lte(hypot(X-${size},Y-${size}),${size}*(N+1)/${frames})*gt(hypot(X-${size},Y-${size}),(${size}*(N+1)/${frames})-${ringWidth}),${g},0)'` +
      `:b='if(lte(hypot(X-${size},Y-${size}),${size}*(N+1)/${frames})*gt(hypot(X-${size},Y-${size}),(${size}*(N+1)/${frames})-${ringWidth}),${b},0)'` +
      `:a='if(lte(hypot(X-${size},Y-${size}),${size}*(N+1)/${frames})*gt(hypot(X-${size},Y-${size}),(${size}*(N+1)/${frames})-${ringWidth}),${alphaVal}*(1-N/${frames}),0)'`

    const rippleSrc = `color=c=black@0:s=${dim}x${dim}:d=${(durationMs / 1000).toFixed(2)}:r=${fps},format=rgba,${geq}[ripple_src]`
    filters.push(rippleSrc)

    // Split the ripple source for each event and shift PTS to match event time.
    // The ripple source is short (e.g. 0.5s). Without PTS shifting, the source
    // reaches EOF before the overlay enable window opens, making it invisible.
    if (rippleEvents.length === 1) {
      const splitLabels = '[rip0_raw]'
      filters.push(`[ripple_src]copy${splitLabels}`)
    } else {
      const splitLabels = rippleEvents.map((_, i) => `[rip${i}_raw]`).join('')
      filters.push(`[ripple_src]split=${rippleEvents.length}${splitLabels}`)
    }

    // Shift each copy's PTS to align with its event time
    for (let i = 0; i < rippleEvents.length; i++) {
      const startPts = rippleEvents[i].time.toFixed(4)
      filters.push(`[rip${i}_raw]setpts=PTS+${startPts}/TB[rip${i}]`)
    }

    // Overlay each ripple at its position and time
    const rippleDurSec = durationMs / 1000
    for (let i = 0; i < rippleEvents.length; i++) {
      const ev = rippleEvents[i]
      const rippleSize = ev.rippleSize ?? size
      const ox = Math.round(ev.x - rippleSize)
      const oy = Math.round(ev.y - rippleSize)
      const enableStart = ev.time.toFixed(4)
      const enableEnd = (ev.time + rippleDurSec).toFixed(4)
      const nextLabel =
        i === rippleEvents.length - 1 ? outputLabel : `ripple_${i}`

      filters.push(
        `[${currentInput}][rip${i}]overlay=x='${ox}':y='${oy}':enable='between(t\\,${enableStart}\\,${enableEnd})':eof_action=pass:format=auto[${nextLabel}]`,
      )
      currentInput = nextLabel
    }
  } else {
    // Rename last cursor overlay output to desired output label
    const lastFilter = filters[filters.length - 1]
    const lastBracket = lastFilter.lastIndexOf('[')
    filters[filters.length - 1] =
      lastFilter.substring(0, lastBracket) + `[${outputLabel}]`
  }

  return {
    filterGraph: filters.join(';'),
    extraInputArgs,
  }
}

/**
 * Convert a WebM video to MP4 (H.264 + AAC).
 * Strips alpha channel, enables web streaming with faststart.
 */
export async function convertToMp4(inputPath: string): Promise<string> {
  const dir = path.dirname(inputPath)
  const base = path.basename(inputPath, path.extname(inputPath))
  const outputPath = path.join(dir, `${base}.mp4`)

  await runFFmpeg([
    '-i',
    inputPath,
    '-c:v',
    'libx264',
    '-crf',
    '18',
    '-preset',
    'slow',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-c:a',
    'aac',
    '-y',
    outputPath,
  ])

  return outputPath
}

/**
 * Convert a video to GIF using two-pass palette approach for quality.
 */
export async function convertToGif(inputPath: string): Promise<string> {
  const dir = path.dirname(inputPath)
  const base = path.basename(inputPath, path.extname(inputPath))
  const outputPath = path.join(dir, `${base}.gif`)
  const palettePath = path.join(
    os.tmpdir(),
    `testreel-palette-${Date.now()}.png`,
  )

  try {
    // Pass 1: generate optimal palette
    await runFFmpeg([
      '-i',
      inputPath,
      '-vf',
      'fps=15,scale=-1:-1:flags=lanczos,palettegen',
      '-y',
      palettePath,
    ])

    // Pass 2: use palette to produce high-quality GIF
    await runFFmpeg([
      '-i',
      inputPath,
      '-i',
      palettePath,
      '-filter_complex',
      'fps=15,scale=-1:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a',
      '-y',
      outputPath,
    ])
  } finally {
    try {
      fs.unlinkSync(palettePath)
    } catch {}
  }

  return outputPath
}
