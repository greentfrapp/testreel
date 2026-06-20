import type { TTSFormat } from '../types'

export interface OpenAISynthesizeInput {
  apiKey?: string
  model: string
  voice: string
  format: TTSFormat
  text: string
}

/** Map our format names to OpenAI `response_format` values. */
const RESPONSE_FORMAT: Record<TTSFormat, string> = {
  opus: 'opus',
  mp3: 'mp3',
  wav: 'wav',
}

const ENDPOINT = 'https://api.openai.com/v1/audio/speech'

/**
 * Synthesize speech via the OpenAI audio/speech endpoint. Returns raw audio
 * bytes in the requested container.
 */
export async function synthesizeOpenAI(
  input: OpenAISynthesizeInput,
): Promise<Buffer> {
  if (!input.apiKey) {
    throw new Error(
      'OpenAI TTS: missing API key. Set the OPENAI_API_KEY environment variable ' +
        'or pass narration.apiKey in the recording definition.',
    )
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      input: input.text,
      voice: input.voice,
      response_format: RESPONSE_FORMAT[input.format],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const keyPreview = input.apiKey.slice(0, 6) + '...'
    throw new Error(
      `OpenAI TTS failed at POST ${ENDPOINT} (${res.status}): ${body}\n` +
        `  model: ${input.model}, voice: ${input.voice}\n` +
        `  key starts with: ${keyPreview}`,
    )
  }

  const arrayBuf = await res.arrayBuffer()
  return Buffer.from(arrayBuf)
}
