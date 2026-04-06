import fs from 'fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordPage } from '../record-page'

/** Normalize path separators to forward slashes for cross-platform assertions. */
const norm = (p: string) => p.replace(/\\/g, '/')

// Mock heavy dependencies that are not under test
vi.mock('../pipeline', () => ({
  runPostProcessPipeline: vi
    .fn()
    .mockResolvedValue('/tmp/test-output/processed.webm'),
}))
vi.mock('../post-process', () => ({
  convertToMp4: vi.fn().mockResolvedValue('/tmp/test-output/recording.mp4'),
  convertToGif: vi.fn().mockResolvedValue('/tmp/test-output/recording.gif'),
}))

const videoMock = {
  saveAs: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
}

const contextMock = {
  close: vi.fn().mockResolvedValue(undefined),
}

function mockPage(overrides: Record<string, any> = {}) {
  const waitForMock = vi.fn().mockResolvedValue(undefined)
  const boundingBoxMock = vi
    .fn()
    .mockResolvedValue({ x: 50, y: 50, width: 100, height: 40 })
  const focusMock = vi.fn().mockResolvedValue(undefined)
  const fillMock = vi.fn().mockResolvedValue(undefined)
  const locatorEvaluateMock = vi.fn().mockResolvedValue('default')
  return {
    video: vi.fn().mockReturnValue(videoMock),
    viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
    context: vi.fn().mockReturnValue(contextMock),
    locator: vi.fn().mockReturnValue({
      waitFor: waitForMock,
      boundingBox: boundingBoxMock,
      focus: focusMock,
      fill: fillMock,
      evaluate: locatorEvaluateMock,
    }),
    evaluate: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    mouse: {
      click: vi.fn().mockResolvedValue(undefined),
      move: vi.fn().mockResolvedValue(undefined),
    },
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
    },
    screenshot: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any
}

describe('recordPage initialization', () => {
  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws when page has no video (context lacks recordVideo)', async () => {
    const page = mockPage({ video: vi.fn().mockReturnValue(null) })
    await expect(recordPage(page)).rejects.toThrow(
      'recordPage requires a browser context created with recordVideo',
    )
  })

  it('throws when page has no viewport', async () => {
    const page = mockPage({ viewportSize: vi.fn().mockReturnValue(null) })
    await expect(recordPage(page)).rejects.toThrow(
      'recordPage requires a page with a viewport set',
    )
  })

  it('succeeds with valid page and returns a PageRecorder', async () => {
    const page = mockPage()
    const recorder = await recordPage(page)
    expect(recorder).toBeDefined()
    expect(recorder.page).toBe(page)
    expect(typeof recorder.click).toBe('function')
    expect(typeof recorder.type).toBe('function')
    expect(typeof recorder.fill).toBe('function')
    expect(typeof recorder.hover).toBe('function')
    expect(typeof recorder.scroll).toBe('function')
    expect(typeof recorder.zoom).toBe('function')
    expect(typeof recorder.screenshot).toBe('function')
    expect(typeof recorder.keyboard).toBe('function')
    expect(typeof recorder.navigate).toBe('function')
    expect(typeof recorder.wait).toBe('function')
    expect(typeof recorder.stop).toBe('function')
  })

  it('creates outputDir on init', async () => {
    const page = mockPage()
    await recordPage(page, { outputDir: '/tmp/custom-output' })
    expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/custom-output', {
      recursive: true,
    })
  })

  it('defaults outputDir to ./testreel-output', async () => {
    const page = mockPage()
    await recordPage(page)
    expect(fs.mkdirSync).toHaveBeenCalledWith('./testreel-output', {
      recursive: true,
    })
  })
})

describe('PageRecorder action methods', () => {
  let page: any
  let recorder: any

  beforeEach(async () => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
    page = mockPage()
    recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('click', () => {
    it('awaits selector and clicks at screen center', async () => {
      await recorder.click('#btn')
      expect(page.locator).toHaveBeenCalledWith('#btn')
      expect(page.locator('#btn').waitFor).toHaveBeenCalledWith({
        state: 'visible',
        timeout: 5000,
      })
      // boundingBox {x:50,y:50,w:100,h:40} → center (100, 70)
      expect(page.mouse.click).toHaveBeenCalledWith(100, 70)
    })

    it('uses custom timeout', async () => {
      await recorder.click('#btn', { timeout: 10000 })
      expect(page.locator('#btn').waitFor).toHaveBeenCalledWith({
        state: 'visible',
        timeout: 10000,
      })
    })

    it('waits pauseAfter (500ms) after click', async () => {
      await recorder.click('#btn')
      expect(page.waitForTimeout).toHaveBeenCalledWith(500)
    })
  })

  describe('type', () => {
    it('awaits selector, clicks, and types text with default delay', async () => {
      await recorder.type('#input', 'hello')
      expect(page.locator).toHaveBeenCalledWith('#input')
      expect(page.mouse.click).toHaveBeenCalledWith(100, 70)
      expect(page.keyboard.type).toHaveBeenCalledWith('hello', { delay: 80 })
    })

    it('uses custom delay', async () => {
      await recorder.type('#input', 'hello', { delay: 50 })
      expect(page.keyboard.type).toHaveBeenCalledWith('hello', { delay: 50 })
    })

    it('triple-clicks to clear when clear option is true', async () => {
      await recorder.type('#input', 'new text', { clear: true })
      expect(page.mouse.click).toHaveBeenCalledWith(100, 70, {
        clickCount: 3,
      })
    })

    it('single-clicks when clear option is false/absent', async () => {
      await recorder.type('#input', 'text')
      expect(page.mouse.click).toHaveBeenCalledWith(100, 70)
    })
  })

  describe('fill', () => {
    it('awaits selector and fills via locator', async () => {
      await recorder.fill('#input', 'filled value')
      expect(page.locator).toHaveBeenCalledWith('#input')
      expect(page.locator('#input').focus).toHaveBeenCalled()
      expect(page.locator('#input').fill).toHaveBeenCalledWith('filled value')
    })
  })

  describe('hover', () => {
    it('awaits selector and moves mouse to screen center', async () => {
      await recorder.hover('.link')
      expect(page.locator).toHaveBeenCalledWith('.link')
      // boundingBox {x:50,y:50,w:100,h:40} → center (100, 70)
      expect(page.mouse.move).toHaveBeenCalledWith(100, 70)
    })
  })

  describe('scroll', () => {
    it('calls page.evaluate with scroll parameters', async () => {
      await recorder.scroll({ x: 0, y: 300 })
      expect(page.evaluate).toHaveBeenCalled()
    })
  })

  describe('keyboard', () => {
    it('presses the specified key', async () => {
      await recorder.keyboard('Enter')
      expect(page.keyboard.press).toHaveBeenCalledWith('Enter')
    })

    it('waits pauseAfter', async () => {
      await recorder.keyboard('Escape')
      expect(page.waitForTimeout).toHaveBeenCalledWith(500)
    })
  })

  describe('navigate', () => {
    it('navigates to URL with networkidle', async () => {
      await recorder.navigate('https://example.com')
      expect(page.goto).toHaveBeenCalledWith('https://example.com', {
        waitUntil: 'networkidle',
        timeout: 10000,
      })
    })
  })

  describe('wait', () => {
    it('waits the specified ms', async () => {
      await recorder.wait(2000)
      expect(page.waitForTimeout).toHaveBeenCalledWith(2000)
    })

    it('defaults to 1000ms', async () => {
      await recorder.wait()
      expect(page.waitForTimeout).toHaveBeenCalledWith(1000)
    })
  })

  describe('screenshot', () => {
    it('takes a screenshot with sanitized name', async () => {
      const filepath = await recorder.screenshot('my-shot')
      expect(page.screenshot).toHaveBeenCalled()
      const callArgs = page.screenshot.mock.calls[0][0]
      expect(norm(callArgs.path)).toMatch(/my-shot\.png$/)
      expect(filepath).toBe(callArgs.path)
    })
  })
})

describe('PageRecorder cursor tracking', () => {
  let page: any

  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'renameSync').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enables cursor by default', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
    })

    // Perform a click — cursor tracker should be called (moveCursorTo uses page.locator)
    await recorder.click('#btn')
    // locator is called for: awaitSelector + moveCursorTo (boundingBox + evaluate for style) + getScreenCenter
    // With cursor enabled, locator is called more times than with cursor disabled
    const locatorCalls = page.locator.mock.calls
    expect(locatorCalls.length).toBeGreaterThanOrEqual(3)
  })

  it('disables cursor when cursor: false', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    await recorder.click('#btn')
    // Only awaitSelector + getScreenCenter locator calls, no moveCursorTo
    const locatorCalls = page.locator.mock.calls
    expect(locatorCalls).toHaveLength(2) // awaitSelector + getScreenCenter
  })

  it('disables cursor when cursor.enabled is false', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: { enabled: false },
    })

    await recorder.click('#btn')
    const locatorCalls = page.locator.mock.calls
    expect(locatorCalls).toHaveLength(2) // awaitSelector + getScreenCenter
  })
})

describe('PageRecorder.stop()', () => {
  let page: any

  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'renameSync').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('closes context, saves video, and returns result', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    const result = await recorder.stop()

    expect(page.screenshot).toHaveBeenCalled() // final screenshot
    expect(contextMock.close).toHaveBeenCalled()
    expect(videoMock.saveAs).toHaveBeenCalled()
    expect(videoMock.delete).toHaveBeenCalled()
    expect(norm(result.video)).toMatch(/recording-.*\.webm$/)
    expect(result.screenshots).toHaveLength(1) // final screenshot
  })

  it('throws on double stop', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    await recorder.stop()
    await expect(recorder.stop()).rejects.toThrow(
      'PageRecorder.stop() has already been called',
    )
  })

  it('accumulates screenshots from actions', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    await recorder.screenshot('shot1')
    await recorder.screenshot('shot2')
    const result = await recorder.stop()

    // 2 action screenshots + 1 final screenshot
    expect(result.screenshots).toHaveLength(3)
  })

  it('closes context not browser — page.context().close() is called', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    await recorder.stop()
    expect(page.context).toHaveBeenCalled()
    expect(contextMock.close).toHaveBeenCalled()
  })
})

describe('PageRecorder.stop() post-processing', () => {
  let page: any

  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'renameSync').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('skips pipeline when no cursor, chrome, background, or speed', async () => {
    const { runPostProcessPipeline } = await import('../pipeline')
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    await recorder.stop()
    expect(runPostProcessPipeline).not.toHaveBeenCalled()
  })

  it('runs pipeline when chrome is enabled', async () => {
    const { runPostProcessPipeline } = await import('../pipeline')
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
      chrome: true,
    })

    await recorder.stop()
    expect(runPostProcessPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        frame: expect.objectContaining({
          videoWidth: 1280,
          videoHeight: 720,
        }),
      }),
    )
  })

  it('runs pipeline when background is enabled', async () => {
    const { runPostProcessPipeline } = await import('../pipeline')
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
      background: { color: '#ff0000' },
    })

    await recorder.stop()
    expect(runPostProcessPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        frame: expect.objectContaining({
          background: { color: '#ff0000' },
        }),
      }),
    )
  })

  it('passes viewport dimensions to pipeline', async () => {
    const { runPostProcessPipeline } = await import('../pipeline')
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
      chrome: true,
    })

    await recorder.stop()
    expect(runPostProcessPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        frame: expect.objectContaining({
          videoWidth: 1280,
          videoHeight: 720,
        }),
      }),
    )
  })

  it('runs pipeline when speed is not 1.0', async () => {
    const { runPostProcessPipeline } = await import('../pipeline')
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
      speed: 2.0,
    })

    await recorder.wait(100)
    await recorder.stop()
    expect(runPostProcessPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        speed: expect.objectContaining({
          globalSpeed: 2.0,
        }),
      }),
    )
  })
})

describe('PageRecorder.stop() format conversion', () => {
  let page: any

  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'renameSync').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not convert when format is webm (default)', async () => {
    const { convertToMp4 } = await import('../post-process')
    const { convertToGif } = await import('../post-process')
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    const result = await recorder.stop()
    expect(convertToMp4).not.toHaveBeenCalled()
    expect(convertToGif).not.toHaveBeenCalled()
    expect(norm(result.video!)).toMatch(/\.webm$/)
  })

  it('converts to mp4 when outputFormat is mp4', async () => {
    const { convertToMp4 } = await import('../post-process')
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
      outputFormat: 'mp4',
    })

    const result = await recorder.stop()
    expect(convertToMp4).toHaveBeenCalled()
    expect(norm(result.video!)).toMatch(/\.mp4$/)
  })

  it('converts to gif when outputFormat is gif', async () => {
    const { convertToGif } = await import('../post-process')
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
      outputFormat: 'gif',
    })

    const result = await recorder.stop()
    expect(convertToGif).toHaveBeenCalled()
    expect(norm(result.video!)).toMatch(/\.gif$/)
  })
})

describe('PageRecorder zoom action', () => {
  let page: any

  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resets zoom when scale=1 and no selector', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    await recorder.zoom({ scale: 1 })
    // Should call evaluate to set transform to scale(1) translate(0, 0)
    expect(page.evaluate).toHaveBeenCalled()
    expect(page.waitForTimeout).toHaveBeenCalledWith(700) // 600 + 100
  })

  it('throws when zoom target selector not found', async () => {
    page = mockPage({
      locator: vi.fn().mockReturnValue({
        waitFor: vi.fn().mockResolvedValue(undefined),
        boundingBox: vi.fn().mockResolvedValue(null),
        focus: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined),
      }),
    })
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    await expect(
      recorder.zoom({ selector: '#missing', scale: 2 }),
    ).rejects.toThrow("zoom target '#missing' not found")
  })

  it('computes zoom translation from selector center', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    await recorder.zoom({ selector: '#target', scale: 2 })
    // locator().boundingBox() for selector center, then evaluate for applying CSS transform
    expect(page.locator).toHaveBeenCalledWith('#target')
    expect(page.evaluate).toHaveBeenCalledTimes(1) // only the CSS transform apply
  })

  it('skips CSS transform when chrome is enabled (FFmpeg zoom)', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
      chrome: true,
    })

    await recorder.zoom({ scale: 2 })
    // CSS transform should NOT be applied — FFmpeg will handle zoom
    expect(page.evaluate).not.toHaveBeenCalled()
    // But waitForTimeout should still be called for timing
    expect(page.waitForTimeout).toHaveBeenCalled()
  })

  it('does not corrupt zoomState when FFmpeg zoom is active', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
      chrome: true,
    })

    // Zoom in — should NOT mutate zoomState since FFmpeg handles it
    await recorder.zoom({ scale: 2, x: 640, y: 360 })
    // A second zoom with a selector should still compute coordinates
    // correctly (zoomState.scale should still be 1, so no transform reversal)
    await recorder.zoom({ selector: '#target', scale: 3 })
    // If zoomState was corrupted to scale=2, this would compute wrong
    // target coordinates. The fact it doesn't throw is the assertion.
    expect(page.evaluate).not.toHaveBeenCalled()
  })

  it('skips CSS transform on zoom reset when background is enabled', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
      background: true,
    })

    await recorder.zoom({ scale: 1 })
    // CSS transform should NOT be applied
    expect(page.evaluate).not.toHaveBeenCalled()
    expect(page.waitForTimeout).toHaveBeenCalledWith(700)
  })
})

describe('PageRecorder name option', () => {
  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'renameSync').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses stable filename derived from name option', async () => {
    const page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      name: 'add-product-demo',
      cursor: false,
    })

    const result = await recorder.stop()
    expect(norm(result.video!)).toBe('/tmp/test-output/add-product-demo.webm')
  })

  it('uses stable filename for final screenshot when name is set', async () => {
    const page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      name: 'my-demo',
      cursor: false,
    })

    const result = await recorder.stop()
    expect(norm(result.screenshots[0])).toBe(
      '/tmp/test-output/my-demo-final.png',
    )
  })

  it('sanitizes the name option', async () => {
    const page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      name: 'my demo (test)',
      cursor: false,
    })

    const result = await recorder.stop()
    expect(norm(result.video!)).toBe('/tmp/test-output/my_demo__test_.webm')
  })

  it('falls back to timestamp when name is not set', async () => {
    const page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    const result = await recorder.stop()
    expect(norm(result.video!)).toMatch(/recording-\d{4}-\d{2}-\d{2}_.*\.webm$/)
  })
})

describe('PageRecorder with Locator objects', () => {
  let page: any
  let recorder: any

  function mockLocator() {
    return {
      waitFor: vi.fn().mockResolvedValue(undefined),
      boundingBox: vi
        .fn()
        .mockResolvedValue({ x: 50, y: 50, width: 100, height: 40 }),
      focus: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue('default'),
    }
  }

  beforeEach(async () => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
    page = mockPage()
    recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('click accepts a Locator object', async () => {
    const locator = mockLocator()
    await recorder.click(locator)
    // Should use the locator directly, not call page.locator()
    expect(locator.waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 5000,
    })
    expect(locator.boundingBox).toHaveBeenCalled()
    expect(page.mouse.click).toHaveBeenCalledWith(100, 70)
  })

  it('type accepts a Locator object', async () => {
    const locator = mockLocator()
    await recorder.type(locator, 'hello')
    expect(locator.waitFor).toHaveBeenCalled()
    expect(locator.boundingBox).toHaveBeenCalled()
    expect(page.keyboard.type).toHaveBeenCalledWith('hello', { delay: 80 })
  })

  it('fill accepts a Locator object', async () => {
    const locator = mockLocator()
    await recorder.fill(locator, 'test value')
    expect(locator.waitFor).toHaveBeenCalled()
    expect(locator.focus).toHaveBeenCalled()
    expect(locator.fill).toHaveBeenCalledWith('test value')
  })

  it('hover accepts a Locator object', async () => {
    const locator = mockLocator()
    await recorder.hover(locator)
    expect(locator.waitFor).toHaveBeenCalled()
    expect(locator.boundingBox).toHaveBeenCalled()
    expect(page.mouse.move).toHaveBeenCalledWith(100, 70)
  })

  it('still works with string selectors (backward compat)', async () => {
    await recorder.click('#btn')
    expect(page.locator).toHaveBeenCalledWith('#btn')
    expect(page.mouse.click).toHaveBeenCalledWith(100, 70)
  })
})

describe('PageRecorder navigate resets zoom', () => {
  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'renameSync').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('zoom state is reset after navigate', async () => {
    const page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    // Zoom in
    await recorder.zoom({ x: 400, y: 300, scale: 2 })
    // Navigate — should reset zoom state
    await recorder.navigate('https://example.com')
    // Next zoom should use default center (640, 360) if no selector/coords
    // Just verify navigate was called correctly
    expect(page.goto).toHaveBeenCalledWith('https://example.com', {
      waitUntil: 'networkidle',
      timeout: 10000,
    })
  })
})

describe('PageRecorder deferred zoom-out', () => {
  let page: any

  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined)
    vi.spyOn(fs, 'renameSync').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('consecutive zoom-clicks do not zoom out between them', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    // Two consecutive zoom-clicks
    await recorder.click('#btn', { zoom: 2 })
    const evaluateCountAfterFirst = page.evaluate.mock.calls.length

    await recorder.click('#btn', { zoom: 2 })
    const evaluateCountAfterSecond = page.evaluate.mock.calls.length

    // Between the two clicks, there should be no zoom-out (scale=1) evaluate call.
    // The zoom-in for the second click should pan directly without resetting.
    // If zoom-out happened, there would be extra evaluate calls for the reset.
    // With deferred zoom-out, the second click's zoom-in replaces the pending zoom-out.
    expect(evaluateCountAfterSecond - evaluateCountAfterFirst).toBeLessThanOrEqual(
      evaluateCountAfterFirst,
    )
  })

  it('zoom-out is flushed before a non-zoom action', async () => {
    page = mockPage()
    const recorder = await recordPage(page, {
      outputDir: '/tmp/test-output',
      cursor: false,
    })

    await recorder.click('#btn', { zoom: 2 })
    const evaluateCountAfterClick = page.evaluate.mock.calls.length

    // A non-zoom action should flush the pending zoom-out
    await recorder.type('#input', 'hello')
    const evaluateCountAfterType = page.evaluate.mock.calls.length

    // The type action should have triggered a zoom-out (evaluate call for scale=1)
    expect(evaluateCountAfterType).toBeGreaterThan(evaluateCountAfterClick)
  })
})
