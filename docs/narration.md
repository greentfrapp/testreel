# Narration (Text-to-Speech)

Testreel can synthesize a voiceover and mux it onto the recording, synced to
what's happening on screen. You attach narration text to steps (and optional
standalone intro/outro cues); Testreel generates the speech, holds each narrated
step on screen until its voice finishes, and writes the audio into the final
video.

## Quick start

```jsonc
{
  "url": "https://example.com",
  "narration": {
    "provider": "openai",
    "voice": "alloy",
    "apiKey": "${OPENAI_API_KEY}",
    "cues": [{ "at": "start", "text": "Welcome to the demo." }]
  },
  "steps": [
    { "action": "click", "selector": ".start", "narrate": "Click to begin." },
    {
      "action": "type",
      "selector": "#search",
      "text": "invoices",
      "narrate": { "text": "Now search for invoices.", "voice": "nova" }
    }
  ]
}
```

```bash
export OPENAI_API_KEY=sk-...
npx testreel definition.jsonc --format mp4
```

## How sync works

- **Video waits for audio.** A narrated step stays on screen until its clip
  finishes — the live page simply idles for any remaining time. Narration is
  never truncated.
- **Speed coexists.** A narrated step's *visuals* can still be sped up with
  `speed`, but the **narration always plays at 1×** (never pitch- or
  time-stretched). The step's slot is floored to the narration length.
- **Anchors.** Step narration starts when the step begins; `start` cues play
  before the first step, `end` cues after the last step.

## The `narrate` field (per step)

Any step accepts `narrate`:

- **String shorthand:** `"narrate": "Click to begin."`
- **Object form** with per-clip overrides:
  `"narrate": { "text": "...", "voice": "nova", "model": "tts-1" }`

## The `narration` block (top level)

| Field      | Default            | Description                                              |
| ---------- | ------------------ | ------------------------------------------------------- |
| `provider` | `openai`           | TTS provider. Only `openai` is supported today.         |
| `voice`    | `alloy`            | Default voice for all clips.                            |
| `model`    | `gpt-4o-mini-tts`  | Default model for all clips.                            |
| `format`   | `opus`             | Clip container: `opus`, `mp3`, or `wav`.                |
| `apiKey`   | `$OPENAI_API_KEY`  | API key. `${ENV_VAR}` substitution is supported.        |
| `cues`     | —                  | Standalone cues: `{ "at": "start" \| "end", "text": "..." }`. |

## Caching

Synthesized clips are content-addressed (by provider, model, voice, format, and
text) and stored under `<outputDir>/.testreel-tts/`. Re-recording with unchanged
narration text reuses the cache — no repeat API calls or cost. The cache
survives `--clean`. Change any clip's text or voice and only that clip is
re-synthesized.

## Output formats

- **WebM** — Opus audio. Native.
- **MP4** — AAC audio.
- **GIF** — has no audio track; narration is skipped with a warning.

## Errors

- A missing API key or unknown provider fails during the prep phase, before the
  browser launches.
- A synthesis failure for any clip fails the run (rather than producing a silent
  gap). The cache keeps retries cheap.
