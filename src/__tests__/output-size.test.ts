import { describe, expect, it } from 'vitest'
import { computeOutputSizeLayout } from '../utils'

describe('computeOutputSizeLayout', () => {
  const viewport = { width: 1280, height: 720 }

  it('increases padding when window fits easily', () => {
    const result = computeOutputSizeLayout(
      { width: 1920, height: 1080 },
      viewport,
      false,
      true,
    )
    // Window is 1280x720, no chrome. Available after 60px min padding: 1800x960.
    // Window fits. Extra space: (1800-1280)/2 = 260, (960-720)/2 = 120.
    // Uniform extra = min(260, 120) = 120. Padding = 60 + 120 = 180.
    expect(result.windowScale).toBe(1)
    expect(result.padding).toBe(180)
  })

  it('increases padding with chrome enabled', () => {
    const result = computeOutputSizeLayout(
      { width: 1920, height: 1080 },
      viewport,
      true, // chrome with default 38px title bar
      true,
    )
    // Window is 1280x(720+38)=758. Available after 60px min: 1800x960.
    // Extra: (1800-1280)/2=260, (960-758)/2=101. Uniform=101. Padding=161.
    expect(result.windowScale).toBe(1)
    expect(result.padding).toBe(161)
  })

  it('uses custom minimum padding from background options', () => {
    const result = computeOutputSizeLayout(
      { width: 1920, height: 1080 },
      viewport,
      false,
      { padding: 100 },
    )
    // Available after 100px min: 1720x880. Extra: (1720-1280)/2=220, (880-720)/2=80.
    // Uniform=80. Padding=180.
    expect(result.windowScale).toBe(1)
    expect(result.padding).toBe(180)
  })

  it('returns windowScale < 1 when window is too large', () => {
    const result = computeOutputSizeLayout(
      { width: 800, height: 600 },
      viewport,
      true,
      true,
    )
    // Window is 1280x758 (with chrome). Available after 60px min: 680x480.
    // scaleW = 680/1280 ≈ 0.531, scaleH = 480/758 ≈ 0.633. Use min = 0.531.
    expect(result.windowScale).toBeCloseTo(680 / 1280, 3)
    expect(result.padding).toBe(60)
  })

  it('returns scale 1 and exact padding when output matches natural size', () => {
    // Natural size with chrome + 60px padding: 1280+120=1400, 720+38+120=878
    const result = computeOutputSizeLayout(
      { width: 1400, height: 878 },
      viewport,
      true,
      true,
    )
    expect(result.windowScale).toBe(1)
    expect(result.padding).toBe(60)
  })

  it('handles no chrome, no background (just outputSize)', () => {
    const result = computeOutputSizeLayout(
      { width: 1920, height: 1080 },
      viewport,
      false,
      false,
    )
    // No chrome, default 60px padding (background not enabled but outputSize implies it).
    // Available: 1800x960. Extra: (1800-1280)/2=260, (960-720)/2=120. Padding=180.
    expect(result.windowScale).toBe(1)
    expect(result.padding).toBe(180)
  })

  it('handles custom titleBarHeight', () => {
    const result = computeOutputSizeLayout(
      { width: 1400, height: 900 },
      viewport,
      { titleBarHeight: 50 },
      true,
    )
    // Window: 1280x(720+50)=770. Available: 1280x780.
    // ExtraW: (1280-1280)/2=0, extraH: (780-770)/2=5. Uniform=0. Padding=60.
    expect(result.windowScale).toBe(1)
    expect(result.padding).toBe(60)
  })
})
