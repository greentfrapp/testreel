import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Reset the cached path between tests by re-importing the module
let getFFmpegPath: typeof import('../ffmpeg').getFFmpegPath
let runFFmpeg: typeof import('../ffmpeg').runFFmpeg

describe('getFFmpegPath', () => {
  beforeEach(async () => {
    vi.resetModules()
    delete process.env.FFMPEG_PATH
    const mod = await import('../ffmpeg')
    getFFmpegPath = mod.getFFmpegPath
    runFFmpeg = mod.runFFmpeg
  })

  afterEach(() => {
    delete process.env.FFMPEG_PATH
    vi.restoreAllMocks()
  })

  it('returns FFMPEG_PATH env var when set', async () => {
    process.env.FFMPEG_PATH = '/custom/bin/ffmpeg'
    const result = await getFFmpegPath()
    expect(result).toBe('/custom/bin/ffmpeg')
  })

  it('falls back to require("ffmpeg-static") when env var is not set', async () => {
    // ffmpeg-static is a dependency, so require should resolve
    const result = await getFFmpegPath()
    // Should be a path (from ffmpeg-static) or 'ffmpeg' (system fallback)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('caches the resolved path on subsequent calls', async () => {
    process.env.FFMPEG_PATH = '/cached/ffmpeg'
    const first = await getFFmpegPath()
    delete process.env.FFMPEG_PATH
    const second = await getFFmpegPath()
    expect(second).toBe(first)
  })
})

describe('runFFmpeg error handling', () => {
  beforeEach(async () => {
    vi.resetModules()
    process.env.FFMPEG_PATH = '/nonexistent/ffmpeg'
    const mod = await import('../ffmpeg')
    runFFmpeg = mod.runFFmpeg
  })

  afterEach(() => {
    delete process.env.FFMPEG_PATH
    vi.restoreAllMocks()
  })

  it('includes helpful hint when ffmpeg binary is not found (ENOENT)', async () => {
    await expect(runFFmpeg(['-version'])).rejects.toThrow(
      /ffmpeg binary not found/,
    )
  })

  it('suggests installing ffmpeg-static in ENOENT error', async () => {
    await expect(runFFmpeg(['-version'])).rejects.toThrow(
      /npm install ffmpeg-static/,
    )
  })

  it('suggests FFMPEG_PATH env var in ENOENT error', async () => {
    await expect(runFFmpeg(['-version'])).rejects.toThrow(/FFMPEG_PATH/)
  })
})
