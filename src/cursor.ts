import type { Locator, Page } from 'playwright-core'
import type {
  CursorEvent,
  CursorOptions,
  CursorStyle,
  CursorTracker,
  ZoomState,
} from './types'

type SelectorOrLocator = string | Locator
// suspendZoom/restoreZoom no longer needed in cursor tracking —
// coordinates are computed mathematically from the zoom transform

/**
 * Encapsulated cursor tracker. Each `record()` call creates its own instance,
 * so concurrent recordings don't corrupt each other's state.
 */
export class CursorTrackerImpl implements CursorTracker {
  private events: CursorEvent[] = []
  private startTime = 0
  private cursorPos = { x: 0, y: 0 }
  private hasMoved = false
  constructor() {
    this.startTime = Date.now()
  }

  private elapsed(): number {
    return (Date.now() - this.startTime) / 1000
  }

  /** Compute cursor transition duration from distance at a constant speed. */
  computeTransitionMs(
    targetX: number,
    targetY: number,
    explicitMs?: number,
  ): number {
    if (explicitMs !== undefined) return explicitMs
    // First move is instant — cursor starts at (0,0) with no visual continuity
    if (!this.hasMoved) {
      this.hasMoved = true
      return 0
    }
    const dx = targetX - this.cursorPos.x
    const dy = targetY - this.cursorPos.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    // Default speed: 500 px/s, clamped to 100–600ms
    const ms = (distance / 500) * 1000
    return Math.max(100, Math.min(600, ms))
  }

  /**
   * Log a cursor move to the center of the given selector.
   * Suspends zoom to get accurate coordinates, then restores it.
   */
  async moveCursorTo(
    page: Page,
    selector: SelectorOrLocator,
    zoomState: ZoomState,
    options: CursorOptions = {},
  ): Promise<void> {
    // Get element bounding box via Playwright locator (supports all selector engines).
    // boundingBox returns screen coordinates (affected by CSS transform).
    // We reverse the transform to get the true layout coordinates for the cursor overlay.
    const locator =
      typeof selector === 'string' ? page.locator(selector) : selector
    const box = await locator.boundingBox()
    if (!box) return

    const { scale, tx, ty } = zoomState

    // Screen coords (with zoom transform applied)
    const screenX = box.x + box.width / 2
    const screenY = box.y + box.height / 2

    // Reverse the CSS transform: screen = (layout + tx) * scale
    // So: layout = screen / scale - tx
    const layoutX = scale === 1 ? screenX : screenX / scale - tx
    const layoutY = scale === 1 ? screenY : screenY / scale - ty

    // Detect cursor style from the target element (runs on the already-located element).
    // Touch mode skips auto-detection — the touch cursor never switches styles.
    const cursorStyle =
      options?.style === 'touch'
        ? 'touch'
        : await locator.evaluate((el) => {
            let style: string = 'default'
            const computed = window.getComputedStyle(el).cursor
            if (computed === 'pointer' || computed === 'text') {
              style = computed
            } else if (
              computed === 'auto' ||
              computed === '' ||
              computed === 'default'
            ) {
              const tag = el.tagName.toLowerCase()
              if (
                tag === 'a' ||
                tag === 'button' ||
                tag === 'select' ||
                tag === 'summary' ||
                el.closest('a') ||
                el.closest('button') ||
                el.getAttribute('role') === 'button' ||
                el.getAttribute('role') === 'link'
              ) {
                style = 'pointer'
              } else if (
                tag === 'textarea' ||
                (el as HTMLElement).isContentEditable
              ) {
                style = 'text'
              } else if (tag === 'input') {
                const inputType = (
                  (el as HTMLInputElement).type || 'text'
                ).toLowerCase()
                const textTypes = [
                  'text',
                  'search',
                  'url',
                  'tel',
                  'email',
                  'password',
                  'number',
                  '',
                ]
                style = textTypes.includes(inputType) ? 'text' : 'pointer'
              }
            }
            return style
          })

    const result = { x: layoutX, y: layoutY, cursorStyle }

    const x = result.x
    const y = result.y

    const transitionMs = this.computeTransitionMs(x, y, options.transitionMs)
    this.cursorPos = { x, y }

    this.events.push({
      time: this.elapsed(),
      type: 'move',
      x,
      y,
      transitionMs,
      cursorStyle: result.cursorStyle as CursorStyle,
    })

    // Wait for the transition duration to maintain visual pacing
    await page.waitForTimeout(transitionMs + 50)
  }

  /**
   * Log a cursor move to an absolute point (no selector lookup).
   */
  async moveCursorToPoint(
    page: Page,
    x: number,
    y: number,
    options: CursorOptions = {},
  ): Promise<void> {
    const transitionMs = this.computeTransitionMs(x, y, options.transitionMs)
    this.cursorPos = { x, y }

    this.events.push({
      time: this.elapsed(),
      type: 'move',
      x,
      y,
      transitionMs,
      cursorStyle: options.style as CursorStyle | undefined,
    })

    await page.waitForTimeout(transitionMs + 50)
  }

  /**
   * Log a ripple event at the current cursor position.
   */
  async triggerRipple(_page: Page, options: CursorOptions = {}): Promise<void> {
    this.events.push({
      time: this.elapsed(),
      type: 'ripple',
      x: this.cursorPos.x,
      y: this.cursorPos.y,
      rippleSize: options.rippleSize ?? 100,
      rippleColor: options.rippleColor ?? 'rgba(0, 0, 0, 0.4)',
    })
  }

  /**
   * Log a hide event.
   */
  async hideCursor(_page: Page): Promise<void> {
    this.events.push({
      time: this.elapsed(),
      type: 'hide',
      x: this.cursorPos.x,
      y: this.cursorPos.y,
    })
  }

  /**
   * Log a show event.
   */
  async showCursor(_page: Page): Promise<void> {
    this.events.push({
      time: this.elapsed(),
      type: 'show',
      x: this.cursorPos.x,
      y: this.cursorPos.y,
    })
  }

  /**
   * Log a zoom level change so the cursor scales proportionally.
   */
  setZoom(scale: number, durationMs: number, tx?: number, ty?: number): void {
    this.events.push({
      time: this.elapsed(),
      type: 'zoom',
      x: this.cursorPos.x,
      y: this.cursorPos.y,
      zoomScale: scale,
      zoomDurationMs: durationMs,
      zoomTx: tx,
      zoomTy: ty,
    })
  }

  /**
   * Return all collected cursor events.
   */
  getEvents(): CursorEvent[] {
    return this.events
  }
}

/** Create a new cursor tracker instance. */
export function createCursorTracker(): CursorTrackerImpl {
  return new CursorTrackerImpl()
}

// ---------------------------------------------------------------------------
// Legacy free-function API (delegates to a module-level default instance)
// ---------------------------------------------------------------------------

let defaultTracker = new CursorTrackerImpl()

export function initCursorTracker(
  _page: Page,
  _options: CursorOptions = {},
): void {
  defaultTracker = new CursorTrackerImpl()
}

export async function moveCursorTo(
  page: Page,
  selector: SelectorOrLocator,
  zoomState: ZoomState,
  options: CursorOptions = {},
): Promise<void> {
  return defaultTracker.moveCursorTo(page, selector, zoomState, options)
}

export async function moveCursorToPoint(
  page: Page,
  x: number,
  y: number,
  options: CursorOptions = {},
): Promise<void> {
  return defaultTracker.moveCursorToPoint(page, x, y, options)
}

export async function triggerRipple(
  page: Page,
  options: CursorOptions = {},
): Promise<void> {
  return defaultTracker.triggerRipple(page, options)
}

export async function hideCursor(page: Page): Promise<void> {
  return defaultTracker.hideCursor(page)
}

export async function showCursor(page: Page): Promise<void> {
  return defaultTracker.showCursor(page)
}

export function getCursorEvents(): CursorEvent[] {
  return defaultTracker.getEvents()
}
