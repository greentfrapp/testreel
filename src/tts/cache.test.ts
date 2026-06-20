import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheKey, getOrSynthesize } from './cache'
import type { ResolvedTTSConfig } from './index'

// Mock the synthesize call and duration probe so the cache is exercised
// without network or ffmpeg. `vi.hoisted` keeps the mock fn available inside
// the hoisted vi.mock factory.
const { synthesizeMock } = vi.hoisted(() => ({ synthesizeMock: vi.fn() }))
vi.mock('./index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./index')>()
  return { ...actual, synthesize: synthesizeMock }
})
vi.mock('../ffmpeg', () => ({
  probeDurationSec: vi.fn(async () => 2.5),
}))

const config: ResolvedTTSConfig = {
  provider: 'openai',
  voice: 'alloy',
  model: 'gpt-4o-mini-tts',
  format: 'opus',
  apiKey: 'sk-test',
}

let cacheDir: string

beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testreel-tts-test-'))
  synthesizeMock.mockReset()
  synthesizeMock.mockResolvedValue(Buffer.from([1, 2, 3]))
})

afterEach(() => {
  fs.rmSync(cacheDir, { recursive: true, force: true })
})

describe('cacheKey', () => {
  it('is stable for identical inputs', () => {
    expect(cacheKey(config, { text: 'hello' })).toBe(
      cacheKey(config, { text: 'hello' }),
    )
  })

  it('differs by text, voice, and model', () => {
    const base = cacheKey(config, { text: 'hello' })
    expect(cacheKey(config, { text: 'world' })).not.toBe(base)
    expect(cacheKey(config, { text: 'hello', voice: 'nova' })).not.toBe(base)
    expect(cacheKey(config, { text: 'hello', model: 'tts-1' })).not.toBe(base)
  })
})

describe('getOrSynthesize', () => {
  it('synthesizes and writes the clip on a miss', async () => {
    const clip = await getOrSynthesize(cacheDir, config, { text: 'hello' })
    expect(synthesizeMock).toHaveBeenCalledTimes(1)
    expect(fs.existsSync(clip.path)).toBe(true)
    expect(clip.durationSec).toBe(2.5)
    expect(clip.path.endsWith('.ogg')).toBe(true) // opus → .ogg
  })

  it('reuses the cached clip on a hit (no second synthesis)', async () => {
    await getOrSynthesize(cacheDir, config, { text: 'hello' })
    await getOrSynthesize(cacheDir, config, { text: 'hello' })
    expect(synthesizeMock).toHaveBeenCalledTimes(1)
  })

  it('uses the right extension per format', async () => {
    const mp3 = await getOrSynthesize(
      cacheDir,
      { ...config, format: 'mp3' },
      { text: 'x' },
    )
    expect(mp3.path.endsWith('.mp3')).toBe(true)
  })
})
