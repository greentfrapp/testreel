import fs from 'fs'
import http from 'http'
import net from 'net'
import os from 'os'
import path from 'path'
import { startViewer } from './remote-viewer.js'
import type { Viewport } from './types'

export interface LoginOptions {
  url: string
  saveState: string
  viewport?: Viewport
  channel?: string
  cdpUrl?: string
  remote?: boolean
  port?: number
}

export async function login(options: LoginOptions): Promise<void> {
  const { chromium } = await import('playwright-core')
  const {
    url,
    saveState,
    viewport = { width: 1280, height: 720 },
    channel,
    cdpUrl,
    remote,
    port: viewerPort = 9222,
  } = options
  const outputPath = path.resolve(saveState)

  let context
  let page
  let tempProfileDir: string | undefined

  if (cdpUrl) {
    console.log(`Connecting to browser at ${cdpUrl} …\n`)
    const browser = await chromium.connectOverCDP(cdpUrl)
    context = browser.contexts()[0] ?? (await browser.newContext({ viewport }))
    page = context.pages()[0] ?? (await context.newPage())
    await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => {})

    console.log('Log in manually, then press Enter here to save the session.')
    await waitForEnter()
  } else if (remote) {
    // Find a free internal CDP port
    const cdpPort = await findFreePort()

    console.log('Launching headless browser…\n')
    const browser = await chromium.launch({
      headless: true,
      channel,
      args: [
        `--remote-debugging-port=${cdpPort}`,
        '--disable-blink-features=AutomationControlled',
      ],
    })

    context = await browser.newContext({ viewport })
    page = await context.newPage()
    await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => {})

    // Get the CDP WebSocket URL for this page
    const cdpWsUrl = await getPageCdpWsUrl(cdpPort)

    // Start the viewer
    const viewer = await startViewer(cdpWsUrl, viewerPort)

    // Set up cleanup
    let cleaned = false
    const cleanup = async () => {
      if (cleaned) return
      cleaned = true
      await viewer.close().catch(() => {})
      await browser.close().catch(() => {})
    }
    process.on('SIGINT', () => cleanup().then(() => process.exit(130)))
    process.on('SIGTERM', () => cleanup().then(() => process.exit(143)))
    process.on('SIGHUP', () => cleanup().then(() => process.exit(129)))

    console.log(`Open ${viewer.url} in your browser to log in.`)
    console.log('Press Enter when done.\n')
    await waitForEnter()

    const state = await context.storageState()
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, JSON.stringify(state, null, 2))

    await cleanup()
    console.log(`\nSession saved to ${outputPath}`)
    return
  } else {
    console.log(
      'Opening browser — log in manually, then close the browser window.\n',
    )

    tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testreel-login-'))
    context = await chromium.launchPersistentContext(tempProfileDir, {
      headless: false,
      channel,
      viewport,
      args: ['--disable-blink-features=AutomationControlled'],
    })
    page = context.pages()[0] ?? (await context.newPage())
    await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => {})

    await page.waitForEvent('close', { timeout: 0 })
  }

  const state = await context.storageState()
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(state, null, 2))

  await context.close()

  if (tempProfileDir) {
    fs.rmSync(tempProfileDir, { recursive: true, force: true })
  }

  console.log(`\nSession saved to ${outputPath}`)
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.setRawMode?.(false)
    process.stdin.resume()
    process.stdin.once('data', () => {
      process.stdin.pause()
      resolve()
    })
  })
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

async function getPageCdpWsUrl(cdpPort: number): Promise<string> {
  const maxAttempts = 10
  const delayMs = 300

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const wsUrl = await new Promise<string>((resolve, reject) => {
        http
          .get(`http://127.0.0.1:${cdpPort}/json`, (res) => {
            let data = ''
            res.on('data', (chunk: Buffer) => (data += chunk))
            res.on('end', () => {
              try {
                const pages = JSON.parse(data) as Array<{
                  webSocketDebuggerUrl?: string
                  type?: string
                }>
                const page = pages.find((p) => p.type === 'page')
                if (page?.webSocketDebuggerUrl) {
                  resolve(page.webSocketDebuggerUrl)
                } else {
                  reject(new Error('No page target found in Chrome DevTools'))
                }
              } catch {
                reject(new Error('Failed to parse Chrome DevTools response'))
              }
            })
          })
          .on('error', (err) => reject(err))
      })
      return wsUrl
    } catch (err) {
      if (attempt === maxAttempts) {
        throw new Error(
          `Chrome DevTools not ready after ${maxAttempts} attempts (${(maxAttempts * delayMs) / 1000}s). ` +
            `Last error: ${err instanceof Error ? err.message : err}`,
        )
      }
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }

  throw new Error('Unreachable')
}
