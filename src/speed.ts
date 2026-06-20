import type { StepTiming } from './types'

/** A contiguous span of the recording timeline at a single playback speed,
 *  annotated with where it lands on the sped-up output timeline. */
export interface SpeedSegment {
  start: number
  end: number
  speed: number
  /** Offset of this segment's start on the output (post-speed) timeline. */
  outStart: number
}

/**
 * Build the piecewise speed timeline from step timings. Gaps between timed
 * steps are filled at `globalSpeed`. Shared by `buildSpeedFilter` (video) and
 * `mapRealToOutput` (audio) so narration anchors land exactly on the video.
 *
 * Pure — no I/O or heavy imports, so it is safe to pull into light modules.
 */
export function buildSpeedSegments(
  stepTimings: StepTiming[],
  globalSpeed: number,
): { segments: SpeedSegment[]; totalOut: number; lastRealEnd: number } {
  const sorted = [...stepTimings].sort((a, b) => a.startTime - b.startTime)
  const segments: SpeedSegment[] = []
  let cursor = 0

  for (const timing of sorted) {
    if (timing.startTime > cursor) {
      segments.push({
        start: cursor,
        end: timing.startTime,
        speed: globalSpeed,
        outStart: 0,
      })
    }
    segments.push({
      start: timing.startTime,
      end: timing.endTime,
      speed: timing.speed,
      outStart: 0,
    })
    cursor = timing.endTime
  }

  let accumulatedOutput = 0
  for (const seg of segments) {
    seg.outStart = accumulatedOutput
    accumulatedOutput += (seg.end - seg.start) / seg.speed
  }

  return { segments, totalOut: accumulatedOutput, lastRealEnd: cursor }
}
