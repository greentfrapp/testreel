import type { CursorStyle } from '../types'
// PNG images are copied to dist/ by the resolve-png-assets esbuild plugin.
// Each import resolves to an absolute path via path.join(__dirname, "<file>").
// @ts-expect-error -- .png resolved to absolute path by esbuild plugin
import defaultCursor from './default.png'
// @ts-expect-error -- .png resolved to absolute path by esbuild plugin
import pointerCursor from './pointer.png'
// @ts-expect-error -- .png resolved to absolute path by esbuild plugin
import textCursor from './text.png'
// @ts-expect-error -- .png resolved to absolute path by esbuild plugin
import touchCursor from './touch.png'

const CURSOR_MAP: Record<CursorStyle, string> = {
  default: defaultCursor,
  pointer: pointerCursor,
  text: textCursor,
  touch: touchCursor,
}

export const CURSOR_STYLES = Object.keys(CURSOR_MAP) as CursorStyle[]

/**
 * Get the absolute path to the bundled cursor PNG on disk.
 * The PNG ships alongside the JS bundle in dist/.
 */
export function getCursorPng(style: CursorStyle = 'default'): string {
  const pngPath = CURSOR_MAP[style]
  if (!pngPath) {
    throw new Error(
      `Unknown cursor style '${style}'. Available: ${CURSOR_STYLES.join(', ')}`,
    )
  }
  return pngPath
}
