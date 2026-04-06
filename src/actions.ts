import path from 'path'
import type { Locator, Page } from 'playwright-core'
import {
  moveCursorTo as defaultMoveCursorTo,
  triggerRipple as defaultTriggerRipple,
} from './cursor'
import { logError } from './logger'
import type {
  ActionContext,
  ActionName,
  ClearStep,
  ClickStep,
  CursorOptions,
  CursorStyle,
  FillStep,
  HoverStep,
  KeyboardStep,
  NavigateStep,
  ScreenshotStep,
  ScrollStep,
  SelectStep,
  Step,
  TypeStep,
  WaitForNetworkStep,
  WaitStep,
  ZoomStep,
} from './types'
import { sanitizeFilename, timestamp } from './utils'

type SelectorOrLocator = string | Locator

function resolveLocator(page: Page, selector: SelectorOrLocator): Locator {
  return typeof selector === 'string' ? page.locator(selector) : selector
}
// zoom suspend/restore no longer needed — all actions use screen coordinates

/** Detect cursor style from a target element (pointer, text, default, etc.) */
export async function detectCursorStyle(
  locator: Locator,
  options?: CursorOptions,
): Promise<CursorStyle> {
  if (options?.style === 'touch') return 'touch'
  const style = await locator.evaluate((el) => {
    const computed = window.getComputedStyle(el).cursor
    if (computed === 'pointer' || computed === 'text') return computed
    if (computed === 'auto' || computed === '' || computed === 'default') {
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
      )
        return 'pointer'
      if (tag === 'textarea' || (el as HTMLElement).isContentEditable)
        return 'text'
      if (tag === 'input') {
        const t = ((el as HTMLInputElement).type || 'text').toLowerCase()
        return [
          'text',
          'search',
          'url',
          'tel',
          'email',
          'password',
          'number',
          '',
        ].includes(t)
          ? 'text'
          : 'pointer'
      }
    }
    return 'default'
  })
  return style as CursorStyle
}

function getMoveCursorTo(ctx: ActionContext) {
  return ctx.cursorTracker
    ? ctx.cursorTracker.moveCursorTo.bind(ctx.cursorTracker)
    : defaultMoveCursorTo
}

function getTriggerRipple(ctx: ActionContext) {
  return ctx.cursorTracker
    ? ctx.cursorTracker.triggerRipple.bind(ctx.cursorTracker)
    : defaultTriggerRipple
}

type ActionHandler = (
  page: Page,
  step: Step,
  ctx: ActionContext,
) => Promise<void | string>

function action<S extends Step>(
  handler: (page: Page, step: S, ctx: ActionContext) => Promise<void | string>,
): ActionHandler {
  return handler as ActionHandler
}

const DEFAULT_SELECTOR_TIMEOUT = 5000

/** Wait for a selector to become visible, retrying until timeout. */
export async function awaitSelector(
  page: Page,
  selector: SelectorOrLocator,
  timeout: number,
): Promise<void> {
  await resolveLocator(page, selector).waitFor({ state: 'visible', timeout })
}

/** Get the screen-space center of an element (includes CSS transform effects). */
export async function getScreenCenter(
  page: Page,
  selector: SelectorOrLocator,
): Promise<{ x: number; y: number } | null> {
  const box = await resolveLocator(page, selector).boundingBox()
  if (!box) return null
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Focus an element without changing zoom. Works at any zoom level. */
export async function focusElement(
  page: Page,
  selector: SelectorOrLocator,
): Promise<void> {
  await resolveLocator(page, selector).focus()
}

async function handleWait(page: Page, step: WaitStep): Promise<void> {
  await page.waitForTimeout(step.ms ?? 1000)
}

async function handleClick(
  page: Page,
  step: ClickStep,
  ctx: ActionContext,
): Promise<void> {
  await awaitSelector(
    page,
    step.selector,
    step.timeout ?? DEFAULT_SELECTOR_TIMEOUT,
  )
  // Skip cursor move here when zoom is set — handleZoom will move it
  if (ctx.cursorEnabled && !step.zoom) {
    await getMoveCursorTo(ctx)(
      page,
      step.selector,
      ctx.zoomState,
      ctx.cursorOptions,
    )
  }

  // Zoom in before clicking if requested
  if (step.zoom && step.zoom > 1) {
    await handleZoom(
      page,
      { action: 'zoom', selector: step.selector, scale: step.zoom },
      ctx,
    )
  }

  if (ctx.cursorEnabled) {
    await getTriggerRipple(ctx)(page, ctx.cursorOptions)
  }
  const center = await getScreenCenter(page, step.selector)
  if (center) {
    await page.mouse.click(center.x, center.y)
  }
}

async function handleType(
  page: Page,
  step: TypeStep,
  ctx: ActionContext,
): Promise<void> {
  await awaitSelector(
    page,
    step.selector,
    step.timeout ?? DEFAULT_SELECTOR_TIMEOUT,
  )
  if (ctx.cursorEnabled) {
    await getMoveCursorTo(ctx)(
      page,
      step.selector,
      ctx.zoomState,
      ctx.cursorOptions,
    )
    if (step.clear) await getTriggerRipple(ctx)(page, ctx.cursorOptions)
  }
  // Click to focus (using screen coordinates preserves zoom)
  const center = await getScreenCenter(page, step.selector)
  if (center) {
    if (step.clear) {
      await page.mouse.click(center.x, center.y, { clickCount: 3 })
    } else {
      await page.mouse.click(center.x, center.y)
    }
  }
  await page.keyboard.type(step.text, { delay: step.delay ?? 80 })
}

async function handleClear(
  page: Page,
  step: ClearStep,
  ctx: ActionContext,
): Promise<void> {
  await awaitSelector(
    page,
    step.selector,
    step.timeout ?? DEFAULT_SELECTOR_TIMEOUT,
  )
  if (ctx.cursorEnabled) {
    await getMoveCursorTo(ctx)(
      page,
      step.selector,
      ctx.zoomState,
      ctx.cursorOptions,
    )
    await getTriggerRipple(ctx)(page, ctx.cursorOptions)
  }
  await focusElement(page, step.selector)
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
}

async function handleFill(
  page: Page,
  step: FillStep,
  ctx: ActionContext,
): Promise<void> {
  await awaitSelector(
    page,
    step.selector,
    step.timeout ?? DEFAULT_SELECTOR_TIMEOUT,
  )
  if (ctx.cursorEnabled) {
    await getMoveCursorTo(ctx)(
      page,
      step.selector,
      ctx.zoomState,
      ctx.cursorOptions,
    )
  }
  // Focus and set value via locator
  const locator = page.locator(step.selector)
  await locator.focus()
  await locator.fill(step.text)
}

async function handleSelect(
  page: Page,
  step: SelectStep,
  ctx: ActionContext,
): Promise<void> {
  await awaitSelector(
    page,
    step.selector,
    step.timeout ?? DEFAULT_SELECTOR_TIMEOUT,
  )
  if (ctx.cursorEnabled) {
    await getMoveCursorTo(ctx)(
      page,
      step.selector,
      ctx.zoomState,
      ctx.cursorOptions,
    )
  }
  // Set select value via locator
  await page.locator(step.selector).selectOption(step.value)
}

async function handleScroll(
  page: Page,
  step: ScrollStep,
  _ctx: ActionContext,
): Promise<void> {
  const baseDuration = 600
  const speedMultiplier = step.scrollSpeed ?? 1
  const duration = baseDuration / speedMultiplier

  await page.evaluate(
    ({ x, y, duration }) => {
      return new Promise<void>((resolve) => {
        const startX = window.scrollX
        const startY = window.scrollY
        const dx = x ?? 0
        const dy = y ?? 0
        const start = performance.now()

        function ease(t: number): number {
          return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        }

        function tick(now: number) {
          const elapsed = now - start
          const t = Math.min(elapsed / duration, 1)
          const p = ease(t)
          window.scrollTo(startX + dx * p, startY + dy * p)
          if (t < 1) {
            requestAnimationFrame(tick)
          } else {
            resolve()
          }
        }

        requestAnimationFrame(tick)
      })
    },
    { x: step.x, y: step.y, duration },
  )
}

async function handleHover(
  page: Page,
  step: HoverStep,
  ctx: ActionContext,
): Promise<void> {
  await awaitSelector(
    page,
    step.selector,
    step.timeout ?? DEFAULT_SELECTOR_TIMEOUT,
  )
  if (ctx.cursorEnabled) {
    await getMoveCursorTo(ctx)(
      page,
      step.selector,
      ctx.zoomState,
      ctx.cursorOptions,
    )
  }
  // Use screen coordinates to trigger :hover without disrupting zoom
  const center = await getScreenCenter(page, step.selector)
  if (center) {
    await page.mouse.move(center.x, center.y)
  }
}

async function handleKeyboard(
  page: Page,
  step: KeyboardStep,
  _ctx: ActionContext,
): Promise<void> {
  await page.keyboard.press(step.key)
}

async function handleNavigate(
  page: Page,
  step: NavigateStep,
  ctx: ActionContext,
): Promise<void> {
  ctx.zoomState.scale = 1
  ctx.zoomState.tx = 0
  ctx.zoomState.ty = 0
  await page
    .goto(step.url, { waitUntil: 'networkidle', timeout: 10000 })
    .catch((err) =>
      logError(
        `  warning: navigate to '${step.url}' did not reach networkidle: ${err.message}`,
      ),
    )
}

async function handleScreenshot(
  page: Page,
  step: ScreenshotStep,
  ctx: ActionContext,
): Promise<string> {
  const name = sanitizeFilename(step.name ?? `step-${timestamp()}`)
  const filepath = path.join(ctx.outputDir, `${name}.png`)
  await page.screenshot({ path: filepath, fullPage: step.fullPage ?? false })
  return filepath
}

async function handleZoom(
  page: Page,
  step: ZoomStep,
  ctx: ActionContext,
): Promise<void> {
  const scale = step.scale ?? 2
  let duration = step.duration ?? 600

  if (ctx.cursorEnabled && step.selector && ctx.cursorTracker) {
    // Compute target position and cursor speed-based transition duration,
    // then use that duration for the zoom pan so both move in sync.
    const loc = page.locator(step.selector)
    const box = await loc.boundingBox()
    if (box) {
      const { scale: curScale, tx: curTx, ty: curTy } = ctx.zoomState
      const screenX = box.x + box.width / 2
      const screenY = box.y + box.height / 2
      const layoutX = curScale === 1 ? screenX : screenX / curScale - curTx
      const layoutY = curScale === 1 ? screenY : screenY / curScale - curTy
      // Cursor speed determines the duration for both cursor and viewport
      const cursorMs = ctx.cursorTracker.computeTransitionMs(layoutX, layoutY)
      if (!step.duration) duration = Math.max(duration, cursorMs)
      const detectedStyle = await detectCursorStyle(loc, ctx.cursorOptions)
      // Don't await — record move event immediately, then zoom event right after
      void ctx.cursorTracker.moveCursorToPoint(page, layoutX, layoutY, {
        ...ctx.cursorOptions,
        style: detectedStyle,
        transitionMs: duration,
      })
    }
  }

  if (scale === 1 && !step.selector) {
    ctx.zoomState.scale = 1
    ctx.zoomState.tx = 0
    ctx.zoomState.ty = 0
    if (ctx.cursorTracker) ctx.cursorTracker.setZoom(1, duration)
    await page.evaluate((ms: number) => {
      const html = document.documentElement
      html.style.transition = `transform ${ms}ms ease-in-out`
      html.style.transformOrigin = 'top left'
      html.style.transform = 'scale(1) translate(0px, 0px)'
    }, duration)
    await page.waitForTimeout(duration + 100)
    return
  }

  // Compute target in layout coordinates without suspending zoom
  let targetX: number
  let targetY: number

  if (step.selector) {
    const { scale: curScale, tx: curTx, ty: curTy } = ctx.zoomState
    const box = await page.locator(step.selector).boundingBox()
    if (!box) throw new Error(`zoom target '${step.selector}' not found`)
    const screenX = box.x + box.width / 2
    const screenY = box.y + box.height / 2
    // Reverse CSS transform to get layout coordinates
    targetX = curScale === 1 ? screenX : screenX / curScale - curTx
    targetY = curScale === 1 ? screenY : screenY / curScale - curTy
  } else {
    targetX = step.x ?? 640
    targetY = step.y ?? 360
  }

  const vp = page.viewportSize()
  if (!vp)
    throw new Error('viewport size not set — cannot compute zoom translation')
  const { width: vw, height: vh } = vp

  const tx = vw / 2 / scale - targetX
  const ty = vh / 2 / scale - targetY

  const clampedTx = Math.min(0, Math.max(vw / scale - vw, tx))
  const clampedTy = Math.min(0, Math.max(vh / scale - vh, ty))

  ctx.zoomState.scale = scale
  ctx.zoomState.tx = clampedTx
  ctx.zoomState.ty = clampedTy
  if (ctx.cursorTracker) ctx.cursorTracker.setZoom(scale, duration)

  await page.evaluate(
    ({
      scale,
      tx,
      ty,
      ms,
    }: {
      scale: number
      tx: number
      ty: number
      ms: number
    }) => {
      const html = document.documentElement
      html.style.transition = `transform ${ms}ms ease-in-out`
      html.style.transformOrigin = 'top left'
      html.style.transform = `scale(${scale}) translate(${tx}px, ${ty}px)`
    },
    { scale, tx: clampedTx, ty: clampedTy, ms: duration },
  )

  await page.waitForTimeout(duration + 100)
}

async function handleWaitForNetwork(
  page: Page,
  step: WaitForNetworkStep,
): Promise<void> {
  const timeout = step.timeout ?? DEFAULT_SELECTOR_TIMEOUT
  await page.waitForResponse(
    (response) => response.url().includes(step.urlPattern),
    { timeout },
  )
}

export const ACTIONS: Record<ActionName, ActionHandler> = {
  wait: action<WaitStep>(handleWait),
  click: action<ClickStep>(handleClick),
  type: action<TypeStep>(handleType),
  clear: action<ClearStep>(handleClear),
  fill: action<FillStep>(handleFill),
  select: action<SelectStep>(handleSelect),
  scroll: action<ScrollStep>(handleScroll),
  hover: action<HoverStep>(handleHover),
  keyboard: action<KeyboardStep>(handleKeyboard),
  navigate: action<NavigateStep>(handleNavigate),
  screenshot: action<ScreenshotStep>(handleScreenshot),
  zoom: action<ZoomStep>(handleZoom),
  waitForNetwork: action<WaitForNetworkStep>(handleWaitForNetwork),
}
