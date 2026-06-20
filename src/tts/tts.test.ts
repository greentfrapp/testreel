import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveTTSConfig, synthesize } from './index'
import { synthesizeOpenAI } from './openai'

describe('resolveTTSConfig', () => {
  const orig = process.env.OPENAI_API_KEY

  afterEach(() => {
    if (orig === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = orig
  })

  it('applies OpenAI defaults', () => {
    delete process.env.OPENAI_API_KEY
    const cfg = resolveTTSConfig()
    expect(cfg).toEqual({
      provider: 'openai',
      voice: 'alloy',
      model: 'gpt-4o-mini-tts',
      format: 'opus',
      apiKey: undefined,
    })
  })

  it('honors explicit config over defaults', () => {
    const cfg = resolveTTSConfig({
      voice: 'nova',
      model: 'tts-1',
      format: 'mp3',
      apiKey: 'sk-explicit',
    })
    expect(cfg.voice).toBe('nova')
    expect(cfg.model).toBe('tts-1')
    expect(cfg.format).toBe('mp3')
    expect(cfg.apiKey).toBe('sk-explicit')
  })

  it('falls back to OPENAI_API_KEY env var', () => {
    process.env.OPENAI_API_KEY = 'sk-from-env'
    expect(resolveTTSConfig().apiKey).toBe('sk-from-env')
  })

  it('rejects unknown providers', () => {
    expect(() =>
      // @ts-expect-error testing invalid provider
      resolveTTSConfig({ provider: 'acme' }),
    ).toThrow(/Unknown TTS provider: 'acme'/)
  })
})

describe('synthesizeOpenAI', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('posts the correct request and returns audio bytes', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }),
    )
    const buf = await synthesizeOpenAI({
      apiKey: 'sk-test',
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      format: 'opus',
      text: 'Hello world',
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/audio/speech')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer sk-test',
    )
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'gpt-4o-mini-tts',
      input: 'Hello world',
      voice: 'alloy',
      response_format: 'opus',
    })
    expect(Buffer.from(buf).equals(Buffer.from([1, 2, 3, 4]))).toBe(true)
  })

  it('throws a clear error without an API key (no request made)', async () => {
    await expect(
      synthesizeOpenAI({
        model: 'm',
        voice: 'v',
        format: 'opus',
        text: 't',
      }),
    ).rejects.toThrow(/missing API key/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws on a non-2xx response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('quota exceeded', { status: 429 }),
    )
    await expect(
      synthesizeOpenAI({
        apiKey: 'sk-test',
        model: 'm',
        voice: 'v',
        format: 'opus',
        text: 't',
      }),
    ).rejects.toThrow(/OpenAI TTS failed.*429.*quota exceeded/s)
  })
})

describe('synthesize (router)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => fetchSpy.mockRestore())

  it('applies per-clip voice/model overrides', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(new Uint8Array([9]), { status: 200 }),
    )
    const cfg = resolveTTSConfig({ voice: 'alloy', apiKey: 'sk-test' })
    await synthesize(cfg, { text: 'hi', voice: 'nova', model: 'tts-1' })
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    )
    expect(body.voice).toBe('nova')
    expect(body.model).toBe('tts-1')
  })
})
