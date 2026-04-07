import { execFile } from 'child_process'

let cachedPath: string | undefined

/**
 * Resolve the path to the ffmpeg binary.
 * Checks (in order): FFMPEG_PATH env var, require('ffmpeg-static'),
 * dynamic import('ffmpeg-static'), then falls back to system 'ffmpeg'.
 */
export async function getFFmpegPath(): Promise<string> {
  if (cachedPath) return cachedPath

  // 1. Explicit env var (escape hatch)
  if (process.env.FFMPEG_PATH) {
    cachedPath = process.env.FFMPEG_PATH
    return cachedPath
  }

  // 2. Try require() — works in CJS and with tsup's createRequire shim
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegPath = require('ffmpeg-static') as string | null
    if (ffmpegPath) {
      cachedPath = ffmpegPath
      return cachedPath
    }
  } catch {
    // require not available or ffmpeg-static not installed
  }

  // 3. Try dynamic import — works in native ESM contexts
  try {
    const mod = await import('ffmpeg-static')
    const ffmpegPath = (mod.default ?? mod) as string | null
    if (ffmpegPath) {
      cachedPath = ffmpegPath
      return cachedPath
    }
  } catch {
    // ffmpeg-static not installed
  }

  // 4. Fall back to system ffmpeg
  cachedPath = 'ffmpeg'
  return cachedPath
}

export async function runFFmpeg(
  args: string[],
  timeoutMs: number = 5 * 60 * 1000,
): Promise<void> {
  const ffmpeg = await getFFmpegPath()
  return new Promise((resolve, reject) => {
    execFile(
      ffmpeg,
      args,
      { maxBuffer: 50 * 1024 * 1024, timeout: timeoutMs },
      (err, _stdout, stderr) => {
        if (err) {
          const isNotFound = (err as NodeJS.ErrnoException).code === 'ENOENT'
          const hint = isNotFound
            ? '\n\nffmpeg binary not found. Either:\n' +
              '  - Install ffmpeg-static: npm install ffmpeg-static\n' +
              '  - Ensure ffmpeg is available in your PATH\n' +
              '  - Set the FFMPEG_PATH environment variable to the ffmpeg binary'
            : ''
          reject(new Error(`ffmpeg failed: ${err.message}${hint}\n${stderr}`))
        } else {
          resolve()
        }
      },
    )
  })
}
