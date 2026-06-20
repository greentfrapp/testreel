# TTS Narration for Testreel — Design

**Date:** 2026-06-20
**Status:** Approved for implementation

## Goal

Let recordings carry a synthesized voiceover that stays synced to what is happening
on screen. Authors attach narration text to steps (and to standalone intro/outro
cues); Testreel synthesizes speech via a pluggable TTS provider, drives recording
timing so each narrated step stays on screen until its voice finishes, and muxes the
audio onto the final video.

## Decisions (from brainstorming)

- **Sync model — video waits for audio.** A narrated step's on-screen slot is
  extended (the live page idles) until its narration clip finishes. Narration is
  never cut.
- **Speed coexistence.** A narrated step's *visuals* may still be sped up via
  `speed`, but its **narration always plays at 1×** (never time-stretched). The
  step's output slot is floored to the narration length; any time beyond the
  sped-up visual is filled by the live page idling at 1×.
- **Engine — pluggable, OpenAI first.** A provider router mirrors the existing
  `src/providers/` auth pattern. OpenAI TTS is the only concrete provider in v1.
- **Authoring — per-step `narrate` + standalone cues.** Any step gets an optional
  `narrate`; a top-level `narration` block holds voice defaults and `cues` (intro
  before step 0, outro after the last step).
- **Caching on by default.** Synthesized clips are content-addressed and reused
  across runs (TTS is slow and paid).

## Schema

```yaml
narration:
  provider: openai            # only 'openai' in v1
  voice: alloy
  model: gpt-4o-mini-tts
  format: opus                # opus | mp3 | wav (opus muxes cleanly into webm)
  apiKey: ${OPENAI_API_KEY}   # optional; falls back to OPENAI_API_KEY env
  cues:
    - at: start               # 'start' (before step 0) | 'end' (after last step)
      text: "Let's walk through the dashboard."
    - at: end
      text: "And that's the overview."

steps:
  - action: click
    selector: ".settings"
    narrate: "First, open settings."                 # string shorthand
  - action: type
    selector: "#search"
    text: "invoices"
    speed: 2
    narrate: { text: "Now we search.", voice: nova } # per-clip override
```

Type changes in `src/types.ts`:

- `BaseStep.narrate?: string | NarrationSpec`
- `NarrationSpec { text: string; voice?: string; model?: string }`
- `NarrationCue extends NarrationSpec { at: 'start' | 'end' }`
- `NarrationConfig { provider?: 'openai'; voice?: string; model?: string;
  format?: 'opus' | 'mp3' | 'wav'; apiKey?: string; cues?: NarrationCue[] }`
- `RecordingDefinition.narration?: NarrationConfig`

## Modules (new)

- `src/tts/index.ts` — router. `resolveTTSProvider(config)` and
  `synthesize(provider, text, voiceOpts): Promise<Buffer>`. Dispatches on
  `config.provider` like `resolveAuth`.
- `src/tts/openai.ts` — OpenAI provider. POSTs to the audio/speech endpoint,
  returns audio bytes. Throws an actionable error on missing key / non-2xx.
- `src/tts/cache.ts` — content-addressed cache keyed by
  `sha256(provider|model|voice|format|text)`. Stores clips under
  `<outputDir>/.testreel-tts/`. `getOrSynthesize()` returns a file path,
  synthesizing + probing duration only on a miss.
- `src/narration.ts` — orchestration glue, all pure where possible:
  - `prepareNarration(def, outputDir)` → resolves every clip (step + cues),
    returns `PreparedNarration { stepClips: Map<stepIndex, Clip>, introClip?,
    outroClip?, format }` where `Clip = { path; durationSec }`.
  - `mapRealToOutput(realSec, stepTimings, globalSpeed)` — pure; maps a real
    recording timestamp to its position on the sped-up output timeline. Identity
    when no speed is active.
  - `buildNarrationAudioFilter(clips, inputIndexStart, stepTimings, globalSpeed)`
    — pure; returns `{ inputArgs, filters, audioMapLabel }`. Each clip becomes an
    `adelay`-shifted chain; multiple clips are merged with `amix`.

Duration probing reuses the FFmpeg `Duration:` parse already used in
`pipeline.ts`; factor it into a small `probeDurationSec(path)` helper in
`src/ffmpeg.ts`.

## Recording flow (`recorder.ts`)

Approach A — synthesize up front, then drive timing live.

1. **Prep phase** (before browser launch): if `def.narration` or any
   `step.narrate` exists, call `prepareNarration`. Missing provider/key fails here
   with a clear message — before any browser work.
2. **Intro cue:** after navigation/`waitForSelector`, idle the live page for the
   intro clip's duration. Record a speed-1 timing segment `[0, introDur]` so the
   intro is never sped up, and anchor the intro clip at output 0.
3. **Per narrated step:** run the action + `pauseAfter` as today (this is the
   sped-up portion). Then compute `actionOut = (stepEnd-stepStart)/speed` and
   `holdOut = max(0, narrationDuration - actionOut)`; idle the live page for
   `holdOut` seconds and push an extra speed-1 timing segment
   `[stepEnd, stepEnd+holdOut]`. Anchor the clip at the step's real start.
4. **Outro cue:** after the last step, idle for the outro duration; push a speed-1
   segment; anchor the clip there.

The existing `StepTiming[]` is the single source of truth; holds are just extra
speed-1 segments, so `buildSpeedFilter` needs no change. Clip anchors are real
timestamps converted to output time at mux time via `mapRealToOutput`.

## Post-processing (`pipeline.ts`)

- Add `narration?: { clips: NarrationClip[]; stepTimings; globalSpeed }` to
  `PipelineConfig`, where `NarrationClip = { path; anchorRealSec; durationSec }`.
- The pipeline now runs when narration exists even with no cursor/frame/speed.
- Replace the `const audioArgs = speed ? ['-an'] : ['-map','0:a?','-c:a','copy']`
  branch:
  - When narration clips exist, append their audio filter chains to the same
    `-filter_complex_script`, add the clip `-i` inputs, and map the mixed audio
    label as output audio with `-c:a libopus`.
  - When there is no narration, keep today's behavior (copy source audio, or
    `-an` under speed).
- The screencast itself has no meaningful audio, so source audio is ignored when
  narration is present.

## Output formats

- **WebM:** Opus audio (`libopus`). Native.
- **MP4:** `convertToMp4` already encodes `-c:a aac`; the muxed track carries over.
- **GIF:** no audio. If narration is configured for a GIF output, warn once and
  render silently.

## Validation (`validation.ts`)

- `narrate` must be a non-empty string or `{ text: string, ... }`.
- `narration.provider`, if present, must be `'openai'`.
- `narration.format`, if present, must be one of `opus|mp3|wav`.
- `narration.cues[].at` must be `'start'|'end'`.
- Env substitution already covers `apiKey: ${OPENAI_API_KEY}`.

## Error handling

- Missing provider/API key → throw in the prep phase before browser launch.
- A single clip's synthesis failure → fail the run (no silent muted gaps). The
  cache makes retries cheap.
- Narration on a GIF target → warn once, render video without audio.

## Testing

- Unit (vitest, mocked — no network/ffmpeg):
  - router dispatch + unknown-provider error
  - OpenAI request shaping (URL, headers, body) via mocked `fetch`
  - cache hit/miss (hash stability, skip on hit)
  - `mapRealToOutput` pure math (identity, single global speed, per-step, holds)
  - `buildNarrationAudioFilter` arg/filter construction (single + multi-clip amix)
  - validation accept/reject cases
- Integration: one narrated example under `examples/` (skipped in CI if no key).

## Out of scope (v1, clean follow-ons)

- Additional providers (ElevenLabs/Azure/local) — router makes them trivial.
- `testreelPage.narrate()` Playwright fixture method.
- Word-level captions/subtitles, background music.
