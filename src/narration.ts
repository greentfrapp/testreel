import path from 'path'
import { buildSpeedSegments } from './speed'
import { getOrSynthesize } from './tts/cache'
import { resolveTTSConfig } from './tts/index'
import type { NarrationSpec, RecordingDefinition, StepTiming } from './types'

/** Default cache directory name, created inside the output directory. */
export const TTS_CACHE_DIRNAME = '.testreel-tts'

export interface PreparedClip {
  path: string
  durationSec: number
}

export interface PreparedNarration {
  /** Clip per step index that has a `narrate` field. */
  stepClips: Map<number, PreparedClip>
  introClip?: PreparedClip
  outroClip?: PreparedClip
}

/** Normalize the string-shorthand or object form into a NarrationSpec. */
export function normalizeNarrate(
  narrate: string | NarrationSpec,
): NarrationSpec {
  return typeof narrate === 'string' ? { text: narrate } : narrate
}

/** True when the definition has any narration to synthesize. */
export function hasNarration(def: RecordingDefinition): boolean {
  return !!(
    (def.narration?.cues && def.narration.cues.length > 0) ||
    def.steps.some((s) => s.narrate)
  )
}

/**
 * Synthesize (or load from cache) every narration clip referenced by the
 * definition, returning clip paths and probed durations. Runs before the
 * browser launches so a missing key/provider fails fast.
 */
export async function prepareNarration(
  def: RecordingDefinition,
  outputDir: string,
): Promise<PreparedNarration> {
  const config = resolveTTSConfig(def.narration)
  const cacheDir = path.join(outputDir, TTS_CACHE_DIRNAME)

  const stepClips = new Map<number, PreparedClip>()
  for (const [i, step] of def.steps.entries()) {
    if (!step.narrate) continue
    stepClips.set(
      i,
      await getOrSynthesize(cacheDir, config, normalizeNarrate(step.narrate)),
    )
  }

  let introClip: PreparedClip | undefined
  let outroClip: PreparedClip | undefined
  for (const cue of def.narration?.cues ?? []) {
    const clip = await getOrSynthesize(cacheDir, config, {
      text: cue.text,
      voice: cue.voice,
      model: cue.model,
    })
    if (cue.at === 'start') introClip = clip
    else if (cue.at === 'end') outroClip = clip
  }

  return { stepClips, introClip, outroClip }
}

/**
 * Map a real recording timestamp to its position on the sped-up output
 * timeline, using the same segment math the video setpts filter uses. Identity
 * when no speed transformation is applied.
 */
export function mapRealToOutput(
  realSec: number,
  stepTimings: StepTiming[],
  globalSpeed: number,
): number {
  if (stepTimings.length === 0) return realSec / globalSpeed

  const { segments, totalOut, lastRealEnd } = buildSpeedSegments(
    stepTimings,
    globalSpeed,
  )

  for (const seg of segments) {
    if (realSec >= seg.start && realSec < seg.end) {
      return seg.outStart + (realSec - seg.start) / seg.speed
    }
  }
  // Before the first segment (segments always start at 0, so this is rare).
  if (segments.length > 0 && realSec < segments[0].start) {
    return realSec / globalSpeed
  }
  // At or beyond the last segment's end.
  return totalOut + (realSec - lastRealEnd) / globalSpeed
}

export interface NarrationClip {
  path: string
  /** Start time on the OUTPUT (post-speed) timeline, in seconds. */
  anchorSec: number
  durationSec: number
}

export interface NarrationAudioFilter {
  inputArgs: string[]
  filters: string[]
  audioMapLabel: string
}

/**
 * Build the FFmpeg audio inputs + filter chains that place each narration clip
 * at its output-timeline anchor and mix them into a single track. Pure — no I/O.
 *
 * `inputIndexStart` is the ffmpeg input index of the first clip (i.e. the count
 * of video inputs already added).
 */
export function buildNarrationAudioFilter(
  clips: NarrationClip[],
  inputIndexStart: number,
): NarrationAudioFilter {
  const inputArgs: string[] = []
  const filters: string[] = []
  const labels: string[] = []

  clips.forEach((clip, i) => {
    const idx = inputIndexStart + i
    inputArgs.push('-i', clip.path)
    const delayMs = Math.max(0, Math.round(clip.anchorSec * 1000))
    const label = `narr${i}`
    // adelay with all=1 applies the same delay to every channel.
    filters.push(`[${idx}:a]adelay=${delayMs}:all=1[${label}]`)
    labels.push(label)
  })

  let audioMapLabel: string
  if (labels.length === 1) {
    audioMapLabel = labels[0]
  } else {
    filters.push(
      `${labels.map((l) => `[${l}]`).join('')}amix=inputs=${labels.length}:normalize=0[narr_mix]`,
    )
    audioMapLabel = 'narr_mix'
  }

  return { inputArgs, filters, audioMapLabel }
}
