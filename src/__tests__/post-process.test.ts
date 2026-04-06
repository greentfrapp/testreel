import { describe, expect, it } from 'vitest'
import {
  buildFilterGraph,
  buildPositionExpr,
  buildStyleExpr,
  buildVisibilityExpr,
  buildZoomSegments,
} from '../post-process'
import type { FilterGraphInput } from '../post-process'
import type { CursorEvent, CursorStyle } from '../types'

/**
 * Evaluate an FFmpeg expression by replacing `t` with a value.
 * Supports the subset used by our expressions: if, lt, +, -, *, /
 */
function evalExpr(expr: string, t: number): number {
  // Replace `t` with the actual value (careful not to replace inside function names like `lt`)
  // We replace standalone `t` that's not part of `lt`
  const code = expr
    .replace(/\blt\b/g, '__LT__')
    .replace(/\bt\b/g, String(t))
    .replace(/__LT__/g, 'lt')

  // Provide `if` and `lt` as JavaScript functions
  const fn = new Function(
    'if_',
    'lt',
    `
    function _eval(expr) {
      return expr;
    }
    // FFmpeg if(cond, then, else)
    const __if = if_;
    const __lt = lt;
    return ${code.replace(/if\(/g, '__if(').replace(/lt\(/g, '__lt(')};
  `,
  )

  return fn(
    (cond: number, then_: number, else_: number) =>
      cond !== 0 ? then_ : else_,
    (a: number, b: number) => (a < b ? 1 : 0),
  )
}

describe('buildPositionExpr', () => {
  it('returns "0" for empty keyframes', () => {
    expect(buildPositionExpr([], 'x')).toBe('0')
  })

  it('returns the value for a single keyframe', () => {
    const expr = buildPositionExpr(
      [{ time: 1, value: 42, transitionMs: 350 }],
      'x',
    )
    expect(expr).toBe('42')
  })

  describe('two keyframes', () => {
    const keyframes = [
      { time: 1, value: 100, transitionMs: 400 },
      { time: 3, value: 500, transitionMs: 400 },
    ]
    const expr = buildPositionExpr(keyframes, 'x')

    it('returns first value before any transition', () => {
      expect(evalExpr(expr, 0)).toBe(100)
      expect(evalExpr(expr, 1)).toBe(100)
      expect(evalExpr(expr, 2)).toBe(100)
    })

    it('interpolates during transition', () => {
      // Transition starts at t=3, ends at t=3.4
      const midpoint = evalExpr(expr, 3.2) // halfway through the 0.4s transition
      expect(midpoint).toBeGreaterThan(100)
      expect(midpoint).toBeLessThan(500)
      expect(midpoint).toBeCloseTo(300, 0)
    })

    it('returns last value after all transitions', () => {
      expect(evalExpr(expr, 3.4)).toBe(500)
      expect(evalExpr(expr, 10)).toBe(500)
    })
  })

  describe('three keyframes', () => {
    const keyframes = [
      { time: 1, value: 0, transitionMs: 500 },
      { time: 3, value: 200, transitionMs: 500 },
      { time: 5, value: 100, transitionMs: 500 },
    ]
    const expr = buildPositionExpr(keyframes, 'y')

    it('returns first value before first transition', () => {
      expect(evalExpr(expr, 0)).toBe(0)
    })

    it('reaches second keyframe value', () => {
      // Transition starts at t=3, ends at t=3.5
      expect(evalExpr(expr, 3.5)).toBe(200)
    })

    it('interpolates toward third keyframe', () => {
      // Transition starts at t=5, ends at t=5.5
      const mid = evalExpr(expr, 5.25) // halfway
      expect(mid).toBeGreaterThan(100)
      expect(mid).toBeLessThan(200)
    })

    it('returns last value after all transitions', () => {
      expect(evalExpr(expr, 5.5)).toBe(100)
      expect(evalExpr(expr, 99)).toBe(100)
    })
  })

  it('handles early keyframe without negative time', () => {
    const keyframes = [
      { time: 0, value: 50, transitionMs: 300 },
      { time: 0.1, value: 200, transitionMs: 300 },
    ]
    const expr = buildPositionExpr(keyframes, 'x')
    // Should not throw or produce NaN
    expect(evalExpr(expr, 0)).toBe(50)
    // Transition starts at t=0.1, ends at t=0.4
    expect(evalExpr(expr, 0.4)).toBe(200)
  })
})

describe('buildFilterGraph', () => {
  const baseInput: FilterGraphInput = {
    cursorSize: 100,
    xExpr: '100',
    yExpr: '200',
    visExpr: '1',
    rippleEvents: [],
    rippleConfig: null,
  }

  const defaultRippleConfig = {
    size: 40,
    r: 59,
    g: 130,
    b: 246,
    baseAlpha: 0.4,
    durationMs: 500,
  }

  it('uses cursor directly when at base size (100)', () => {
    const { filterGraph } = buildFilterGraph(baseInput)
    expect(filterGraph).not.toContain('scale=')
    expect(filterGraph).toContain('[1:v]')
    expect(filterGraph).toContain('[final_out]')
  })

  it('adds scale filter when cursor size differs from base', () => {
    const { filterGraph } = buildFilterGraph({ ...baseInput, cursorSize: 24 })
    expect(filterGraph).toContain(
      '[1:v]scale=24:24:flags=lanczos[cursor_scaled]',
    )
    expect(filterGraph).toContain('[cursor_scaled]')
    expect(filterGraph).not.toContain('[1:v]overlay')
  })

  it('produces no extra input args when there are no ripple events', () => {
    const { filterGraph, extraInputArgs } = buildFilterGraph(baseInput)
    expect(extraInputArgs).toEqual([])
    expect(filterGraph).toContain('[final_out]')
    expect(filterGraph).not.toContain('ripple_src')
  })

  it('adds one ripple overlay for a single ripple event', () => {
    const input: FilterGraphInput = {
      ...baseInput,
      rippleEvents: [{ x: 300, y: 400, time: 2.5, rippleSize: 40 }],
      rippleConfig: defaultRippleConfig,
    }
    const { filterGraph, extraInputArgs } = buildFilterGraph(input)
    // Inline lavfi source — no extra input files
    expect(extraInputArgs).toEqual([])
    expect(filterGraph).toContain('[final_out]')
    // Ripple source generated inline
    expect(filterGraph).toContain('[ripple_src]')
    expect(filterGraph).toContain('[rip0]')
  })

  it('chains multiple ripple overlays with intermediate labels', () => {
    const input: FilterGraphInput = {
      ...baseInput,
      rippleEvents: [
        { x: 100, y: 200, time: 1.0, rippleSize: 40 },
        { x: 300, y: 400, time: 3.0, rippleSize: 40 },
        { x: 500, y: 600, time: 5.0, rippleSize: 40 },
      ],
      rippleConfig: defaultRippleConfig,
    }
    const { filterGraph, extraInputArgs } = buildFilterGraph(input)
    // Inline lavfi source — no extra input files
    expect(extraInputArgs).toEqual([])
    expect(filterGraph).toContain('[ripple_0]')
    expect(filterGraph).toContain('[ripple_1]')
    expect(filterGraph).toContain('[final_out]')
    // Should split ripple source into 3 streams
    expect(filterGraph).toContain('split=3')
    expect(filterGraph).toContain('[rip0]')
    expect(filterGraph).toContain('[rip1]')
    expect(filterGraph).toContain('[rip2]')
  })

  it('encodes ripple position and timing correctly', () => {
    const input: FilterGraphInput = {
      ...baseInput,
      rippleEvents: [{ x: 150, y: 250, time: 2.0, rippleSize: 40 }],
      rippleConfig: defaultRippleConfig,
    }
    const { filterGraph } = buildFilterGraph(input)
    // x = 150 - 40 = 110, y = 250 - 40 = 210
    expect(filterGraph).toContain("x='110'")
    expect(filterGraph).toContain("y='210'")
    // enable between t=2.0 and t=2.5
    expect(filterGraph).toContain('2.0000')
    expect(filterGraph).toContain('2.5000')
  })
})

describe('buildVisibilityExpr', () => {
  it('returns "1" when no hide/show events exist', () => {
    expect(buildVisibilityExpr([])).toBe('1')
  })

  it('returns "1" when only move/ripple events exist', () => {
    const events: CursorEvent[] = [
      { time: 1, type: 'move', x: 0, y: 0 },
      { time: 2, type: 'ripple', x: 0, y: 0 },
    ]
    expect(buildVisibilityExpr(events)).toBe('1')
  })

  describe('single hide event', () => {
    const events: CursorEvent[] = [{ time: 2, type: 'hide', x: 0, y: 0 }]
    const expr = buildVisibilityExpr(events)

    it('is visible before the hide', () => {
      expect(evalExpr(expr, 0)).toBe(1)
      expect(evalExpr(expr, 1.9)).toBe(1)
    })

    it('is hidden after the hide', () => {
      expect(evalExpr(expr, 2)).toBe(0)
      expect(evalExpr(expr, 10)).toBe(0)
    })
  })

  describe('hide then show', () => {
    const events: CursorEvent[] = [
      { time: 1, type: 'move', x: 0, y: 0 },
      { time: 2, type: 'hide', x: 0, y: 0 },
      { time: 4, type: 'show', x: 0, y: 0 },
    ]
    const expr = buildVisibilityExpr(events)

    it('is visible before the hide', () => {
      expect(evalExpr(expr, 0)).toBe(1)
    })

    it('is hidden between hide and show', () => {
      expect(evalExpr(expr, 2)).toBe(0)
      expect(evalExpr(expr, 3)).toBe(0)
    })

    it('is visible after the show', () => {
      expect(evalExpr(expr, 4)).toBe(1)
      expect(evalExpr(expr, 10)).toBe(1)
    })
  })

  describe('multiple hide/show cycles', () => {
    const events: CursorEvent[] = [
      { time: 1, type: 'hide', x: 0, y: 0 },
      { time: 2, type: 'show', x: 0, y: 0 },
      { time: 3, type: 'hide', x: 0, y: 0 },
      { time: 4, type: 'show', x: 0, y: 0 },
    ]
    const expr = buildVisibilityExpr(events)

    it('toggles visibility correctly across cycles', () => {
      expect(evalExpr(expr, 0.5)).toBe(1) // before first hide
      expect(evalExpr(expr, 1.5)).toBe(0) // after first hide
      expect(evalExpr(expr, 2.5)).toBe(1) // after first show
      expect(evalExpr(expr, 3.5)).toBe(0) // after second hide
      expect(evalExpr(expr, 4.5)).toBe(1) // after second show
    })
  })
})

describe('buildStyleExpr', () => {
  it('returns "1" for matching default when no move events have styles', () => {
    expect(buildStyleExpr([], 'default', 'default')).toBe('1')
  })

  it('returns "0" for non-matching default when no move events have styles', () => {
    expect(buildStyleExpr([], 'pointer', 'default')).toBe('0')
  })

  it('returns "0" when all move events use a different style', () => {
    const events: CursorEvent[] = [
      { time: 1, type: 'move', x: 0, y: 0, cursorStyle: 'pointer' },
      { time: 2, type: 'move', x: 0, y: 0, cursorStyle: 'pointer' },
    ]
    const expr = buildStyleExpr(events, 'text', 'default')
    expect(evalExpr(expr, 0)).toBe(0)
    expect(evalExpr(expr, 1.5)).toBe(0)
    expect(evalExpr(expr, 3)).toBe(0)
  })

  describe('style switching', () => {
    const events: CursorEvent[] = [
      { time: 1, type: 'move', x: 0, y: 0, cursorStyle: 'default' },
      { time: 3, type: 'move', x: 0, y: 0, cursorStyle: 'text' },
      { time: 5, type: 'move', x: 0, y: 0, cursorStyle: 'pointer' },
    ]

    it('tracks default style correctly', () => {
      const expr = buildStyleExpr(events, 'default', 'default')
      expect(evalExpr(expr, 0.5)).toBe(1) // before first move, uses defaultStyle
      expect(evalExpr(expr, 2)).toBe(1) // after first move (default)
      expect(evalExpr(expr, 4)).toBe(0) // after second move (text)
      expect(evalExpr(expr, 6)).toBe(0) // after third move (pointer)
    })

    it('tracks text style correctly', () => {
      const expr = buildStyleExpr(events, 'text', 'default')
      expect(evalExpr(expr, 0.5)).toBe(0)
      expect(evalExpr(expr, 2)).toBe(0)
      expect(evalExpr(expr, 4)).toBe(1)
      expect(evalExpr(expr, 6)).toBe(0)
    })

    it('tracks pointer style correctly', () => {
      const expr = buildStyleExpr(events, 'pointer', 'default')
      expect(evalExpr(expr, 0.5)).toBe(0)
      expect(evalExpr(expr, 2)).toBe(0)
      expect(evalExpr(expr, 4)).toBe(0)
      expect(evalExpr(expr, 6)).toBe(1)
    })
  })
})

describe('buildZoomSegments', () => {
  it('returns single segment at base size when no zoom events', () => {
    const segments = buildZoomSegments([], 32)
    expect(segments).toHaveLength(1)
    expect(segments[0].cursorSize).toBe(32)
    expect(segments[0].enableExpr).toBe('1')
  })

  it('returns multiple segments for a single zoom event', () => {
    const events: CursorEvent[] = [
      { time: 2, type: 'zoom', x: 0, y: 0, zoomScale: 2, zoomDurationMs: 600 },
    ]
    const segments = buildZoomSegments(events, 32)
    // Should have: pre-zoom segment (32px) + intermediate steps + post-zoom segment (64px)
    expect(segments.length).toBeGreaterThan(2)
    // First and last sizes should be 32 and 64
    const sizes = segments.map((s) => s.cursorSize)
    expect(Math.min(...sizes)).toBe(32)
    expect(Math.max(...sizes)).toBe(64)
  })

  it('generates interpolated intermediate sizes during transition', () => {
    const events: CursorEvent[] = [
      { time: 5, type: 'zoom', x: 0, y: 0, zoomScale: 2, zoomDurationMs: 600 },
    ]
    const segments = buildZoomSegments(events, 32)
    const sizes = [...new Set(segments.map((s) => s.cursorSize))].sort(
      (a, b) => a - b,
    )
    // Should have sizes between 32 and 64 (not just those two)
    expect(sizes.length).toBeGreaterThan(2)
    expect(sizes[0]).toBe(32)
    expect(sizes[sizes.length - 1]).toBe(64)
    // All intermediate sizes should be between 32 and 64
    for (const size of sizes) {
      expect(size).toBeGreaterThanOrEqual(32)
      expect(size).toBeLessThanOrEqual(64)
    }
  })

  it('handles zoom-in then zoom-out', () => {
    const events: CursorEvent[] = [
      { time: 2, type: 'zoom', x: 0, y: 0, zoomScale: 2, zoomDurationMs: 600 },
      { time: 5, type: 'zoom', x: 0, y: 0, zoomScale: 1, zoomDurationMs: 600 },
    ]
    const segments = buildZoomSegments(events, 32)
    // Should have segments covering both transitions
    const sizes = segments.map((s) => s.cursorSize)
    expect(sizes).toContain(32) // base size
    expect(sizes).toContain(64) // zoomed size
    // Enable expressions should cover the full timeline
    for (const seg of segments) {
      expect(seg.enableExpr).toBeTruthy()
    }
  })

  it('ignores non-zoom events', () => {
    const events: CursorEvent[] = [
      { time: 1, type: 'move', x: 100, y: 200 },
      { time: 2, type: 'ripple', x: 100, y: 200 },
      { time: 3, type: 'hide', x: 0, y: 0 },
    ]
    const segments = buildZoomSegments(events, 32)
    expect(segments).toHaveLength(1)
    expect(segments[0].cursorSize).toBe(32)
  })
})
