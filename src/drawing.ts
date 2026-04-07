// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Convert '#RRGGBB' or '#RGB' to FFmpeg '0xRRGGBB' format. */
export function hexToFFmpeg(hex: string): string {
  let h = hex.replace(/^#/, '')
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`Invalid hex color: '${hex}' (expected #RGB or #RRGGBB)`)
  }
  return '0x' + h
}
