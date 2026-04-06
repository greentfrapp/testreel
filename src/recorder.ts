import fs from 'fs'
import path from 'path'
import { ACTIONS } from './actions'
import { createCursorTracker } from './cursor'
import { log, logError, logVerbose } from './logger'
import { runPostProcessPipeline } from './pipeline'
import { convertToGif, convertToMp4 } from './post-process'
import { resolveAuth } from './providers'
import type {
  ActionContext,
  CursorOptions,
  OutputFormat,
  RecordOptions,
  RecordingDefinition,
  RecordingResult,
  StepTiming,
} from './types'
import { cleanOutputDir, computeOutputSizeLayout, timestamp } from './utils'
import { loadDefinition } from './validation'
import { createZoomState } from './zoom'

export async function record(
  input: RecordingDefinition | string,
  options: RecordOptions = {},
): Promise<RecordingResult> {
  const def =
    typeof input === 'string'
      ? loadDefinition(input)
      : loadDefinition(structuredClone(input))

  // Resolve auth provider → merge into definition
  if (def.auth) {
    log('  resolving auth...')
    const authResult = await resolveAuth(def.auth)

    if (authResult.localStorage) {
      def.localStorage = { ...def.localStorage, ...authResult.localStorage }
    }
    if (authResult.cookies) {
      def.cookies = [...(def.cookies ?? []), ...authResult.cookies]
    }
    if (authResult.headers) {
      def.headers = { ...def.headers, ...authResult.headers }
    }
    log('  auth resolved.')
  }

  const outputDir = options.outputDir ?? './testreel-output'
  const headless = options.headless ?? true
  // CLI --setup takes precedence over inline setup block
  const setup = options.setup ?? def.setup

  fs.mkdirSync(outputDir, { recursive: true })

  if (options.clean) {
    cleanOutputDir(outputDir)
  }

  const viewport = def.viewport ?? { width: 1280, height: 720 }
  const outputSizeLayout = def.outputSize
    ? computeOutputSizeLayout(
        def.outputSize,
        viewport,
        def.chrome,
        def.background,
      )
    : undefined
  const zoomState = createZoomState()
  const screenshots: string[] = []

  // Resolve storage state if provided
  let storageState: object | undefined
  if (def.storageState) {
    const statePath = path.resolve(def.storageState)
    storageState = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
  }

  log('  launching browser...')
  const { chromium } = await import('playwright-core')
  const browser = await chromium.launch({ headless })

  // --- Setup phase (no video) ---
  let setupScroll: { x: number; y: number } | undefined
  if (setup) {
    log('  running setup...')

    const setupContextOptions: Record<string, unknown> = {
      viewport,
      colorScheme: def.colorScheme ?? 'light',
    }

    if (storageState) {
      setupContextOptions.storageState = storageState
    }

    if (def.headers) {
      setupContextOptions.extraHTTPHeaders = def.headers
    }

    const setupContext = await browser.newContext(setupContextOptions)

    if (def.cookies && def.cookies.length > 0) {
      await setupContext.addCookies(def.cookies)
    }

    const setupPage = await setupContext.newPage()

    // Navigate to setup URL (or main URL if not specified)
    const setupUrl = setup.url ?? def.url
    try {
      await setupPage.goto(setupUrl, { waitUntil: 'load', timeout: 15000 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logError(
        `  warning: setup navigation to '${setupUrl}' did not reach load: ${msg}`,
      )
    }

    // Handle localStorage injection during setup
    if (def.localStorage && Object.keys(def.localStorage).length > 0) {
      await setupPage.evaluate((entries: Record<string, string>) => {
        for (const [key, value] of Object.entries(entries)) {
          localStorage.setItem(key, value)
        }
      }, def.localStorage)
      await setupPage
        .reload({ waitUntil: 'load', timeout: 15000 })
        .catch((err) =>
          logError(`  warning: reload did not reach load: ${err.message}`),
        )
    }

    // Execute setup steps
    const setupCtx: ActionContext = {
      outputDir,
      zoomState: createZoomState(),
      cursorEnabled: false,
    }
    for (const [i, step] of setup.steps.entries()) {
      const label =
        step.action + ('selector' in step ? ` ${step.selector}` : '')
      log(`  [setup ${i + 1}/${setup.steps.length}] ${label}`)

      try {
        await ACTIONS[step.action](setupPage, step, setupCtx)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logError(`  setup step ${i + 1} failed: ${msg}`)
      }

      if (step.action !== 'wait') {
        await setupPage.waitForTimeout(step.pauseAfter ?? 500)
      }
    }

    // Capture scroll position before closing setup
    setupScroll = await setupPage.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY,
    }))

    // Export session state and close setup context
    storageState = await setupContext.storageState()
    await setupContext.close()
    log('  setup complete.')
  }

  // --- Recording phase (with video) ---
  const contextOptions: Record<string, unknown> = {
    viewport,
    colorScheme: def.colorScheme ?? 'light',
    recordVideo: {
      dir: outputDir,
      size: { width: viewport.width, height: viewport.height },
    },
  }

  if (storageState) {
    contextOptions.storageState = storageState
  }

  if (def.headers) {
    contextOptions.extraHTTPHeaders = def.headers
  }

  const context = await browser.newContext(contextOptions)

  // Only add cookies/localStorage manually when there was no setup phase
  // (setup phase already baked them into the exported storageState)
  if (!setup) {
    if (def.cookies && def.cookies.length > 0) {
      await context.addCookies(def.cookies)
    }
  }

  const page = await context.newPage()
  const needsScrollRestore =
    setupScroll && (setupScroll.x !== 0 || setupScroll.y !== 0)

  // Hide page before navigation so the pre-scroll frame isn't visible in the video.
  // Intercept the HTML response and inject a <style> tag that hides everything.
  // This is more reliable than addInitScript because the CSS is parsed before any
  // rendering — the compositor never paints a frame at scroll position 0.
  if (needsScrollRestore) {
    await page.route('**/*', async (route, request) => {
      const response = await route.fetch()
      const contentType = response.headers()['content-type'] ?? ''
      if (
        request.resourceType() === 'document' &&
        contentType.includes('text/html')
      ) {
        let body = await response.text()
        const hideStyle =
          '<style id="__testreel-hide">html{visibility:hidden!important}</style>'
        // Inject right after <head> if present, otherwise prepend
        if (body.includes('<head>')) {
          body = body.replace('<head>', '<head>' + hideStyle)
        } else if (body.includes('<head ')) {
          body = body.replace(/<head\s[^>]*>/, (match) => match + hideStyle)
        } else {
          body = hideStyle + body
        }
        await route.fulfill({ response, body })
      } else {
        await route.fulfill({ response })
      }
    })
  }

  // Handle localStorage auth (requires navigating first) — skip if setup handled it
  if (!setup && def.localStorage && Object.keys(def.localStorage).length > 0) {
    await page
      .goto(def.url, { waitUntil: 'commit', timeout: 15000 })
      .catch((err) =>
        logError(`  warning: initial navigation failed: ${err.message}`),
      )
    await page.evaluate((entries: Record<string, string>) => {
      for (const [key, value] of Object.entries(entries)) {
        localStorage.setItem(key, value)
      }
    }, def.localStorage)
    await page
      .reload({ waitUntil: 'load', timeout: 15000 })
      .catch((err) =>
        logError(`  warning: reload did not reach load: ${err.message}`),
      )
  } else {
    try {
      await page.goto(def.url, { waitUntil: 'load', timeout: 15000 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logError(
        `  warning: navigation to '${def.url}' did not reach load: ${msg}`,
      )
    }
  }

  // Restore scroll position from setup, then reveal the page
  if (needsScrollRestore) {
    await page.unrouteAll({ behavior: 'wait' })
    await page.evaluate(({ x, y }) => {
      window.scrollTo(x, y)
      const hideStyle = document.getElementById('__testreel-hide')
      if (hideStyle) hideStyle.remove()
    }, setupScroll!)
  }

  if (def.waitForSelector) {
    await page
      .waitForSelector(def.waitForSelector, { timeout: 10000 })
      .catch((err) =>
        logError(
          `  warning: waitForSelector '${def.waitForSelector}' failed: ${err.message}`,
        ),
      )
  }

  // Normalize cursor options — enabled by default
  const cursorConfig = def.cursor
  const cursorEnabled =
    cursorConfig === undefined ||
    cursorConfig === true ||
    (typeof cursorConfig === 'object' && cursorConfig.enabled !== false)
  const cursorOptions: CursorOptions | undefined = cursorEnabled
    ? typeof cursorConfig === 'object'
      ? cursorConfig
      : {}
    : undefined

  const cursorTracker = cursorEnabled ? createCursorTracker() : undefined

  // Determine if frame compositing will be active (for FFmpeg zoom)
  const hasFrameForZoom = !!(def.chrome || def.background)

  // Execute steps
  const ctx: ActionContext = {
    outputDir,
    zoomState,
    cursorEnabled,
    cursorOptions,
    cursorTracker,
    useFFmpegZoom: hasFrameForZoom,
  }
  const globalSpeed = options.speed ?? def.speed ?? 1.0
  const stepTimings: StepTiming[] = []
  const stepTimerStart = Date.now()

  for (const [i, step] of def.steps.entries()) {
    const label = step.action + ('selector' in step ? ` ${step.selector}` : '')

    const stepStart = (Date.now() - stepTimerStart) / 1000
    const stepWallStart = Date.now()

    // Process waitFor condition before dispatching to action handler
    if (step.waitFor) {
      try {
        if (step.waitFor === 'networkidle') {
          await page.waitForLoadState('networkidle')
        } else {
          await page.waitForSelector(step.waitFor, {
            timeout: step.timeout ?? 5000,
          })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logError(`  step ${i + 1} waitFor failed: ${msg}`)
      }
    }

    try {
      const result = await ACTIONS[step.action](page, step, ctx)
      if (step.action === 'screenshot' && typeof result === 'string') {
        screenshots.push(result)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logError(`  step ${i + 1} failed: ${msg}`)
    }

    if (step.action !== 'wait') {
      await page.waitForTimeout(step.pauseAfter ?? 500)
    }

    // Zoom out after click+pause — unless the next step is also a zoom click
    if (step.action === 'click' && (step as import('./types').ClickStep).zoom) {
      const nextStep = def.steps[i + 1]
      const nextHasZoom =
        nextStep?.action === 'click' &&
        (nextStep as import('./types').ClickStep).zoom
      if (!nextHasZoom) {
        await ACTIONS.zoom(
          page,
          { action: 'zoom', scale: 1 } as import('./types').ZoomStep,
          ctx,
        )
      }
    }

    const stepEnd = (Date.now() - stepTimerStart) / 1000
    const elapsed = ((Date.now() - stepWallStart) / 1000).toFixed(1)
    log(`  [${i + 1}/${def.steps.length}] ${label} (${elapsed}s)`)

    stepTimings.push({
      stepIndex: i,
      startTime: stepStart,
      endTime: stepEnd,
      speed: step.speed ?? globalSpeed,
    })
  }

  const totalElapsed = ((Date.now() - stepTimerStart) / 1000).toFixed(1)
  log(`  steps completed in ${totalElapsed}s`)

  // Final screenshot
  const finalPath = path.join(outputDir, `final-${timestamp()}.png`)
  await page.screenshot({ path: finalPath })
  screenshots.push(finalPath)

  // Save video: close the context first (finalizes the video file),
  // then call saveAs on the video handle.
  const video = page.video()
  const baseName =
    typeof input === 'string'
      ? path.basename(input, path.extname(input))
      : 'recording'
  let videoPath: string | undefined
  let cursorEventsPath: string | undefined

  await context.close()

  if (video) {
    videoPath = path.join(outputDir, `${baseName}-${timestamp()}.webm`)
    await video.saveAs(videoPath)
    await video.delete()
  }

  await browser.close()

  // Write cursor events for debugging/reference
  let cursorEventsForPipeline: import('./types').CursorEvent[] | undefined
  if (cursorTracker && videoPath) {
    const cursorEvents = cursorTracker.getEvents()
    cursorEventsPath = path.join(outputDir, `${baseName}-cursor.json`)
    fs.writeFileSync(cursorEventsPath, JSON.stringify(cursorEvents, null, 2))
    logVerbose(
      `  cursor events: ${cursorEvents.length} events → ${cursorEventsPath}`,
    )
    if (cursorEvents.length > 0) {
      cursorEventsForPipeline = cursorEvents
    }
  }

  // Resolve chrome/background config
  const chromeConfig = def.chrome
  const bgConfig = def.background
  const hasChrome =
    chromeConfig === true ||
    (typeof chromeConfig === 'object' && chromeConfig.enabled !== false)
  const hasBackground =
    bgConfig === true ||
    (typeof bgConfig === 'object' && bgConfig.enabled !== false)

  let chromeOpts = hasChrome
    ? typeof chromeConfig === 'object'
      ? { ...chromeConfig }
      : {}
    : undefined
  let bgOpts: import('./types').BackgroundOptions | undefined = hasBackground
    ? typeof bgConfig === 'object'
      ? { ...bgConfig }
      : {}
    : undefined
  if (chromeOpts && chromeOpts.url === true) {
    chromeOpts = { ...chromeOpts, url: def.url }
  }

  // Apply outputSize layout: override padding and enable background if needed
  let windowScale: number | undefined
  if (outputSizeLayout) {
    if (!bgOpts) {
      bgOpts = {}
    }
    bgOpts = { ...bgOpts, padding: outputSizeLayout.padding }
    if (outputSizeLayout.windowScale < 1) {
      windowScale = outputSizeLayout.windowScale
    }
  }

  const hasFrame = !!(chromeOpts || bgOpts)

  const needsSpeed =
    globalSpeed !== 1.0 || stepTimings.some((t) => t.speed !== 1.0)
  const needsPipeline = cursorEventsForPipeline || hasFrame || needsSpeed

  if (needsPipeline && videoPath) {
    log('  post-processing...')
    try {
      const processedPath = await runPostProcessPipeline({
        videoPath,
        cursor: cursorEventsForPipeline
          ? {
              events: cursorEventsForPipeline,
              defaultStyle: cursorOptions?.style ?? 'default',
              size: cursorOptions?.size ?? 24,
            }
          : undefined,
        frame: hasFrame
          ? {
              chrome: chromeOpts,
              background: bgOpts,
              videoWidth: viewport.width,
              videoHeight: viewport.height,
              screenshots,
              windowScale,
            }
          : undefined,
        speed: needsSpeed ? { stepTimings, globalSpeed } : undefined,
        outputSize: def.outputSize,
      })
      if (processedPath !== videoPath) {
        fs.unlinkSync(videoPath)
        fs.renameSync(processedPath, videoPath)
      }
      log('  post-processing complete.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logError(`  warning: post-processing failed: ${msg}`)
    }
  }

  // Convert output format if not WebM
  const outputFormat: OutputFormat =
    options.outputFormat ?? def.outputFormat ?? 'webm'
  if (outputFormat !== 'webm' && videoPath) {
    log(`  converting to ${outputFormat}...`)
    try {
      const converter = outputFormat === 'mp4' ? convertToMp4 : convertToGif
      const convertedPath = await converter(videoPath)
      fs.unlinkSync(videoPath)
      videoPath = convertedPath
      log(`  conversion to ${outputFormat} complete.`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logError(`  warning: format conversion failed: ${msg}`)
    }
  }

  // Clean up intermediate files unless --keep-intermediates
  if (!options.keepIntermediates) {
    if (cursorEventsPath) {
      try {
        fs.unlinkSync(cursorEventsPath)
        logVerbose(`  cleaned up: ${cursorEventsPath}`)
        cursorEventsPath = undefined
      } catch {
        // ignore — file may already be gone
      }
    }
  }

  // Write output manifest
  let manifestPath: string | undefined
  const manifest = {
    timestamp: new Date().toISOString(),
    definition: typeof input === 'string' ? path.resolve(input) : undefined,
    video: videoPath ? path.relative(outputDir, videoPath) : undefined,
    screenshots: screenshots.map((s) => path.relative(outputDir, s)),
    viewport,
  }
  manifestPath = path.join(outputDir, 'output.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  logVerbose(`  manifest: ${manifestPath}`)

  return {
    video: videoPath,
    screenshots,
    cursorEvents: cursorEventsPath,
    manifest: manifestPath,
  }
}
