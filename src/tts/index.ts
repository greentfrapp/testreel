import type { NarrationConfig, NarrationSpec, TTSFormat } from '../types'
import { synthesizeOpenAI } from './openai'

export interface ResolvedTTSConfig {
  provider: 'openai'
  voice: string
  model: string
  format: TTSFormat
  apiKey?: string
}

const SUPPORTED_PROVIDERS = ['openai'] as const

/**
 * Resolve a NarrationConfig into a concrete TTS configuration, applying
 * provider defaults and the standard API-key env-var fallback.
 */
export function resolveTTSConfig(
  config: NarrationConfig = {},
): ResolvedTTSConfig {
  const provider = config.provider ?? 'openai'
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(
      `Unknown TTS provider: '${provider}'. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`,
    )
  }
  return {
    provider,
    voice: config.voice ?? 'alloy',
    model: config.model ?? 'gpt-4o-mini-tts',
    format: config.format ?? 'opus',
    apiKey: config.apiKey ?? process.env.OPENAI_API_KEY,
  }
}

/**
 * Synthesize a single narration clip. Per-clip voice/model overrides take
 * precedence over the resolved defaults.
 */
export async function synthesize(
  config: ResolvedTTSConfig,
  spec: NarrationSpec,
): Promise<Buffer> {
  switch (config.provider) {
    case 'openai':
      return synthesizeOpenAI({
        apiKey: config.apiKey,
        model: spec.model ?? config.model,
        voice: spec.voice ?? config.voice,
        format: config.format,
        text: spec.text,
      })
    default:
      throw new Error(`Unknown TTS provider: '${config.provider}'`)
  }
}
