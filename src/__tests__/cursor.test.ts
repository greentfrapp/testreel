import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCursorTracker,
  getCursorEvents,
  hideCursor,
  initCursorTracker,
  moveCursorTo,
  moveCursorToPoint,
  showCursor,
  triggerRipple,
} from '../cursor'
import type { ZoomState } from '../types'

/** Minimal Page mock — only the methods cursor.ts actually calls. */
function mockPage(
  elementCenter: { x: number; y: number } | null = { x: 100, y: 200 },
) {
  const boundingBox = elementCenter
    ? {
        x: elementCenter.x - 50,
        y: elementCenter.y - 20,
        width: 100,
        height: 40,
      }
    : null
  return {
    locator: vi.fn().mockReturnValue({
      boundingBox: vi.fn().mockResolvedValue(boundingBox),
      evaluate: vi.fn().mockResolvedValue('default'),
    }),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  } as any
}

function zoomState(): ZoomState {
  return { scale: 1, tx: 0, ty: 0 }
}

describe('cursor event tracker', () => {
  beforeEach(() => {
    initCursorTracker(mockPage(), {})
  })

  it('starts with an empty event log', () => {
    expect(getCursorEvents()).toEqual([])
  })

  describe('moveCursorTo', () => {
    it('logs a move event with element center coordinates', async () => {
      const page = mockPage({ x: 300, y: 150 })
      await moveCursorTo(page, '#btn', zoomState(), { transitionMs: 200 })

      const events = getCursorEvents()
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('move')
      expect(events[0].x).toBe(300)
      expect(events[0].y).toBe(150)
      expect(events[0].transitionMs).toBe(200)
    })

    it('first move is instant (no visual continuity from origin)', async () => {
      const page = mockPage({ x: 50, y: 50 })
      await moveCursorTo(page, '#el', zoomState())

      expect(getCursorEvents()[0].transitionMs).toBe(0)
    })

    it('subsequent moves use speed-based transitionMs', async () => {
      const page = mockPage({ x: 500, y: 400 })
      // First move (instant)
      await moveCursorTo(page, '#el', zoomState())
      // Second move — distance from (500,400) to (500,400) = 0, clamped to 100ms
      await moveCursorTo(page, '#el', zoomState())

      expect(getCursorEvents()[1].transitionMs).toBe(100)
    })

    it('does not log an event when element is not found', async () => {
      const page = mockPage(null)
      await moveCursorTo(page, '#missing', zoomState())

      expect(getCursorEvents()).toHaveLength(0)
    })

    it('passes XPath selectors starting with // to page.locator', async () => {
      const page = mockPage({ x: 150, y: 250 })
      await moveCursorTo(page, '//button[@type="submit"]', zoomState())

      expect(page.locator).toHaveBeenCalledWith('//button[@type="submit"]')
      const events = getCursorEvents()
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ type: 'move', x: 150, y: 250 })
    })

    it('passes XPath selectors starting with .. to page.locator', async () => {
      const page = mockPage({ x: 80, y: 90 })
      await moveCursorTo(page, '../div', zoomState())

      expect(page.locator).toHaveBeenCalledWith('../div')
      const events = getCursorEvents()
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ type: 'move', x: 80, y: 90 })
    })

    it('waits for transitionMs + 50ms after logging', async () => {
      const page = mockPage({ x: 10, y: 20 })
      await moveCursorTo(page, '#el', zoomState(), { transitionMs: 400 })

      expect(page.waitForTimeout).toHaveBeenCalledWith(450)
    })

    it('accepts a Locator object instead of a string selector', async () => {
      const page = mockPage({ x: 300, y: 150 })
      const locator = {
        boundingBox: vi
          .fn()
          .mockResolvedValue({ x: 250, y: 130, width: 100, height: 40 }),
        evaluate: vi.fn().mockResolvedValue('pointer'),
      }

      await moveCursorTo(page, locator as any, zoomState(), {
        transitionMs: 200,
      })

      // Should use the locator directly, not call page.locator()
      expect(locator.boundingBox).toHaveBeenCalled()
      expect(page.locator).not.toHaveBeenCalled()

      const events = getCursorEvents()
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ type: 'move', x: 300, y: 150 })
    })
  })

  describe('moveCursorToPoint', () => {
    it('logs a move event at the given coordinates', async () => {
      const page = mockPage()
      await moveCursorToPoint(page, 500, 600, { transitionMs: 100 })

      const events = getCursorEvents()
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: 'move',
        x: 500,
        y: 600,
        transitionMs: 100,
      })
    })
  })

  describe('triggerRipple', () => {
    it('logs a ripple event at current cursor position', async () => {
      const page = mockPage({ x: 200, y: 300 })
      await moveCursorTo(page, '#btn', zoomState())
      await triggerRipple(page, { rippleSize: 60, rippleColor: 'red' })

      const events = getCursorEvents()
      expect(events).toHaveLength(2)
      expect(events[1]).toMatchObject({
        type: 'ripple',
        x: 200,
        y: 300,
        rippleSize: 60,
        rippleColor: 'red',
      })
    })

    it('uses default ripple options', async () => {
      const page = mockPage()
      await triggerRipple(page)

      const ev = getCursorEvents()[0]
      expect(ev.rippleSize).toBe(100)
      expect(ev.rippleColor).toBe('rgba(0, 0, 0, 0.4)')
    })
  })

  describe('hideCursor / showCursor', () => {
    it('logs hide and show events', async () => {
      const page = mockPage()
      await hideCursor(page)
      await showCursor(page)

      const events = getCursorEvents()
      expect(events).toHaveLength(2)
      expect(events[0].type).toBe('hide')
      expect(events[1].type).toBe('show')
    })
  })

  describe('event timestamps', () => {
    it('records increasing timestamps', async () => {
      const page = mockPage({ x: 0, y: 0 })
      await moveCursorTo(page, '#a', zoomState())
      await triggerRipple(page)
      await hideCursor(page)

      const events = getCursorEvents()
      expect(events).toHaveLength(3)
      for (let i = 1; i < events.length; i++) {
        expect(events[i].time).toBeGreaterThanOrEqual(events[i - 1].time)
      }
    })

    it('timestamps are in seconds', async () => {
      const page = mockPage({ x: 0, y: 0 })
      await moveCursorTo(page, '#a', zoomState())

      // The event should have been logged within a few ms of initCursorTracker
      const events = getCursorEvents()
      expect(events[0].time).toBeGreaterThanOrEqual(0)
      expect(events[0].time).toBeLessThan(5) // sanity check: < 5 seconds
    })
  })

  describe('setZoom', () => {
    it('logs a zoom event with scale and duration', () => {
      const tracker = createCursorTracker()
      tracker.setZoom(2, 600)

      const events = tracker.getEvents()
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: 'zoom',
        zoomScale: 2,
        zoomDurationMs: 600,
      })
    })

    it('records current cursor position in zoom event', async () => {
      const tracker = createCursorTracker()
      const page = mockPage({ x: 300, y: 400 })
      await tracker.moveCursorTo(page, '#btn', zoomState())
      tracker.setZoom(1.5, 400)

      const events = tracker.getEvents()
      const zoomEvent = events.find((e) => e.type === 'zoom')!
      expect(zoomEvent.x).toBe(300)
      expect(zoomEvent.y).toBe(400)
    })

    it('stores zoomTx and zoomTy when provided', () => {
      const tracker = createCursorTracker()
      tracker.setZoom(2, 600, -100, -50)

      const events = tracker.getEvents()
      expect(events[0]).toMatchObject({
        type: 'zoom',
        zoomScale: 2,
        zoomDurationMs: 600,
        zoomTx: -100,
        zoomTy: -50,
      })
    })

    it('leaves zoomTx/zoomTy undefined when not provided', () => {
      const tracker = createCursorTracker()
      tracker.setZoom(2, 600)

      const events = tracker.getEvents()
      expect(events[0].zoomTx).toBeUndefined()
      expect(events[0].zoomTy).toBeUndefined()
    })
  })

  describe('initCursorTracker resets state', () => {
    it('clears events from a previous session', async () => {
      const page = mockPage({ x: 0, y: 0 })
      await moveCursorTo(page, '#a', zoomState())
      expect(getCursorEvents()).toHaveLength(1)

      initCursorTracker(page, {})
      expect(getCursorEvents()).toHaveLength(0)
    })
  })
})
