import { describe, expect, it, vi } from 'vitest'
import { ACTIONS } from '../actions'
import type { ActionContext } from '../types'

// Minimal mock page matching cursor.test.ts pattern
function mockPage() {
  const waitForMock = vi.fn().mockResolvedValue(undefined)
  const boundingBoxMock = vi
    .fn()
    .mockResolvedValue({ x: 50, y: 50, width: 100, height: 40 })
  const focusMock = vi.fn().mockResolvedValue(undefined)
  const fillMock = vi.fn().mockResolvedValue(undefined)
  const selectOptionMock = vi.fn().mockResolvedValue(undefined)
  return {
    locator: vi.fn().mockReturnValue({
      waitFor: waitForMock,
      boundingBox: boundingBoxMock,
      focus: focusMock,
      fill: fillMock,
      selectOption: selectOptionMock,
    }),
    evaluate: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForResponse: vi.fn().mockResolvedValue(undefined),
    mouse: {
      click: vi.fn().mockResolvedValue(undefined),
      move: vi.fn().mockResolvedValue(undefined),
    },
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
    },
    screenshot: vi.fn().mockResolvedValue(undefined),
    viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
  }
}

function baseCtx(): ActionContext {
  return {
    outputDir: '/tmp/test-output',
    zoomState: { scale: 1, tx: 0, ty: 0 },
    cursorEnabled: false,
  }
}

describe('ACTIONS registry', () => {
  const expectedActions = [
    'wait',
    'click',
    'type',
    'clear',
    'fill',
    'select',
    'scroll',
    'hover',
    'keyboard',
    'navigate',
    'screenshot',
    'zoom',
    'waitForNetwork',
    'hideCursor',
    'showCursor',
  ]

  it('has handlers for all expected action types', () => {
    for (const action of expectedActions) {
      expect(ACTIONS[action], `missing handler for '${action}'`).toBeDefined()
      expect(typeof ACTIONS[action]).toBe('function')
    }
  })

  it('has exactly the expected number of actions', () => {
    expect(Object.keys(ACTIONS)).toHaveLength(expectedActions.length)
  })

  it('does not contain unexpected action types', () => {
    for (const key of Object.keys(ACTIONS)) {
      expect(expectedActions, `unexpected action '${key}'`).toContain(key)
    }
  })
})

describe('selector-based actions await selector', () => {
  it('click waits for selector with default timeout', async () => {
    const page = mockPage()
    await ACTIONS.click(
      page as any,
      { action: 'click', selector: '#btn' } as any,
      baseCtx(),
    )
    expect(page.locator).toHaveBeenCalledWith('#btn')
    expect(page.locator('#btn').waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 5000,
    })
    // boundingBox {x:50,y:50,w:100,h:40} → center (100, 70)
    expect(page.mouse.click).toHaveBeenCalledWith(100, 70)
  })

  it('click uses custom timeout when provided', async () => {
    const page = mockPage()
    await ACTIONS.click(
      page as any,
      { action: 'click', selector: '#btn', timeout: 10000 } as any,
      baseCtx(),
    )
    expect(page.locator('#btn').waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 10000,
    })
  })

  it('fill waits for selector before filling', async () => {
    const page = mockPage()
    await ACTIONS.fill(
      page as any,
      { action: 'fill', selector: '#input', text: 'hello' } as any,
      baseCtx(),
    )
    expect(page.locator).toHaveBeenCalledWith('#input')
    expect(page.locator('#input').waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 5000,
    })
    // fill now uses locator.fill()
    expect(page.locator('#input').fill).toHaveBeenCalledWith('hello')
  })

  it('hover waits for selector before hovering', async () => {
    const page = mockPage()
    await ACTIONS.hover(
      page as any,
      { action: 'hover', selector: '.link' } as any,
      baseCtx(),
    )
    expect(page.locator).toHaveBeenCalledWith('.link')
    expect(page.locator('.link').waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 5000,
    })
    // boundingBox {x:50,y:50,w:100,h:40} → center (100, 70)
    expect(page.mouse.move).toHaveBeenCalledWith(100, 70)
  })

  it('type waits for selector before typing', async () => {
    const page = mockPage()
    await ACTIONS.type(
      page as any,
      { action: 'type', selector: '#field', text: 'abc' } as any,
      baseCtx(),
    )
    expect(page.locator).toHaveBeenCalledWith('#field')
    expect(page.locator('#field').waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 5000,
    })
    expect(page.keyboard.type).toHaveBeenCalledWith('abc', { delay: 80 })
  })

  it('clear waits for selector before clearing', async () => {
    const page = mockPage()
    await ACTIONS.clear(
      page as any,
      { action: 'clear', selector: '#field' } as any,
      baseCtx(),
    )
    expect(page.locator).toHaveBeenCalledWith('#field')
    expect(page.locator('#field').waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 5000,
    })
  })

  it('select waits for selector before selecting', async () => {
    const page = mockPage()
    await ACTIONS.select(
      page as any,
      { action: 'select', selector: '#drop', value: 'opt1' } as any,
      baseCtx(),
    )
    expect(page.locator).toHaveBeenCalledWith('#drop')
    expect(page.locator('#drop').waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 5000,
    })
    // select now uses locator.selectOption()
    expect(page.locator('#drop').selectOption).toHaveBeenCalledWith('opt1')
  })
})

describe('XPath selector support', () => {
  it('click works with XPath selectors', async () => {
    const page = mockPage()
    await ACTIONS.click(
      page as any,
      { action: 'click', selector: '//button[@type="submit"]' } as any,
      baseCtx(),
    )
    expect(page.locator).toHaveBeenCalledWith('//button[@type="submit"]')
    expect(page.mouse.click).toHaveBeenCalledWith(100, 70)
  })

  it('fill works with XPath selectors', async () => {
    const page = mockPage()
    await ACTIONS.fill(
      page as any,
      {
        action: 'fill',
        selector: '//input[@name="email"]',
        text: 'test',
      } as any,
      baseCtx(),
    )
    expect(page.locator).toHaveBeenCalledWith('//input[@name="email"]')
    expect(page.locator('//input[@name="email"]').fill).toHaveBeenCalledWith(
      'test',
    )
  })

  it('hover works with XPath selectors', async () => {
    const page = mockPage()
    await ACTIONS.hover(
      page as any,
      { action: 'hover', selector: '//a[@href="/about"]' } as any,
      baseCtx(),
    )
    expect(page.locator).toHaveBeenCalledWith('//a[@href="/about"]')
    expect(page.mouse.move).toHaveBeenCalledWith(100, 70)
  })

  it('type works with XPath selectors', async () => {
    const page = mockPage()
    await ACTIONS.type(
      page as any,
      { action: 'type', selector: '//textarea', text: 'hello' } as any,
      baseCtx(),
    )
    expect(page.locator).toHaveBeenCalledWith('//textarea')
    expect(page.keyboard.type).toHaveBeenCalledWith('hello', { delay: 80 })
  })
})

describe('waitForNetwork action', () => {
  it('calls page.waitForResponse with a URL matcher', async () => {
    const page = mockPage()
    await ACTIONS.waitForNetwork(
      page as any,
      { action: 'waitForNetwork', urlPattern: '/api/data' } as any,
      baseCtx(),
    )
    expect(page.waitForResponse).toHaveBeenCalledTimes(1)
    // Verify the matcher function and options
    const [matcher, options] = page.waitForResponse.mock.calls[0]
    expect(typeof matcher).toBe('function')
    expect(options).toEqual({ timeout: 5000 })
  })

  it('URL matcher matches responses containing the pattern', async () => {
    const page = mockPage()
    await ACTIONS.waitForNetwork(
      page as any,
      { action: 'waitForNetwork', urlPattern: '/api/data' } as any,
      baseCtx(),
    )
    const matcher = page.waitForResponse.mock.calls[0][0]
    expect(matcher({ url: () => 'https://example.com/api/data?page=1' })).toBe(
      true,
    )
    expect(matcher({ url: () => 'https://example.com/other' })).toBe(false)
  })

  it('uses custom timeout when provided', async () => {
    const page = mockPage()
    await ACTIONS.waitForNetwork(
      page as any,
      { action: 'waitForNetwork', urlPattern: '/api', timeout: 15000 } as any,
      baseCtx(),
    )
    const [, options] = page.waitForResponse.mock.calls[0]
    expect(options).toEqual({ timeout: 15000 })
  })

  it('uses default 5000ms timeout when not provided', async () => {
    const page = mockPage()
    await ACTIONS.waitForNetwork(
      page as any,
      { action: 'waitForNetwork', urlPattern: '/api' } as any,
      baseCtx(),
    )
    const [, options] = page.waitForResponse.mock.calls[0]
    expect(options).toEqual({ timeout: 5000 })
  })
})
