import { test as base } from '@playwright/test'
import type { Page } from 'playwright-core'
import { recordPage } from './record-page.js'
import type { PageRecorder, RecordPageOptions } from './record-page.js'
import { sanitizeFilename } from './utils.js'

export type TestreelFixtures = {
  /**
   * Standard Playwright Page with video recording enabled.
   * Use for setup steps, assertions, and any interaction that does **not**
   * need a cursor animation in the final recording.
   */
  page: Page
  /**
   * Testreel page recorder. Actions performed through this object are
   * captured with animated cursor movement, click ripples, and
   * post-processing (window chrome, background, speed changes).
   * Use for the visible demo steps you want in the final video.
   * Access the underlying page via `testreelPage.page` when needed.
   */
  testreelPage: PageRecorder
  /** Configuration for the testreel recording. Set via `test.use({ testreelOptions: { ... } })`. */
  testreelOptions: RecordPageOptions & {
    viewport?: { width: number; height: number }
  }
}

/**
 * Raw fixtures object — compose into your own test.extend() alongside
 * other custom fixtures (auth, database, etc.):
 *
 *   import { test as base } from '@playwright/test'
 *   import { testreelFixtures, type TestreelFixtures } from 'testreel/playwright'
 *
 *   const test = base.extend<TestreelFixtures>(testreelFixtures)
 */
export const testreelFixtures: Parameters<
  typeof base.extend<TestreelFixtures>
>[0] = {
  testreelOptions: [{}, { option: true }],

  page: async ({ browser, testreelOptions }, use, testInfo) => {
    const projectUse = testInfo.project.use
    const viewport = testreelOptions.viewport ??
      projectUse.viewport ?? { width: 1280, height: 720 }
    const context = await browser.newContext({
      ...projectUse.contextOptions,
      storageState: projectUse.storageState,
      locale: projectUse.locale,
      extraHTTPHeaders: projectUse.extraHTTPHeaders,
      geolocation: projectUse.geolocation,
      permissions: projectUse.permissions,
      viewport,
      recordVideo: {
        dir: testInfo.outputDir,
        size: {
          width: viewport.width,
          height: viewport.height,
        },
      },
    })

    const page = await context.newPage()
    ;(page as any)._videoStartedAt = Date.now()
    await use(page)

    // Finalize video and attach to test report
    const video = page.video()
    try {
      await context.close()
    } catch {
      // Context may already be closed by testreelPage.stop()
    }
    if (video) {
      try {
        await testInfo.attach('testreel-video', {
          path: await video.path(),
          contentType: 'video/webm',
        })
      } catch {
        // Video may have been handled by testreelPage
      }
    }
  },

  testreelPage: async ({ page, testreelOptions }, use, testInfo) => {
    const name = testreelOptions.name ?? sanitizeFilename(testInfo.title)
    const videoStartedAt = (page as any)._videoStartedAt as number | undefined
    const recorder = await recordPage(page, {
      clean: true,
      outputDir: testInfo.outputDir,
      name,
      ...testreelOptions,
      videoStartedAt,
    })

    await use(recorder)

    // Finalize recording even on test failure
    try {
      const result = await recorder.stop()
      if (result.video) {
        await testInfo.attach('testreel-video', {
          path: result.video,
          contentType: 'video/webm',
        })
      }
      for (const s of result.screenshots) {
        await testInfo.attach('testreel-screenshot', {
          path: s,
          contentType: 'image/png',
        })
      }
    } catch {
      // Partial video on failure — swallow error
    }
  },
}

/** Pre-composed test for the simple case: `import { test } from 'testreel/playwright'` */
export const test = base.extend<TestreelFixtures>(testreelFixtures)

export { expect } from '@playwright/test'
export type {
  PageRecorder,
  RecordPageOptions,
  SelectorOrLocator,
} from './record-page.js'
