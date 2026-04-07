import { Command } from 'commander'
import { setLogLevel } from './logger'
// login and recorder are lazy-imported inside their action handlers
// to avoid eagerly loading playwright-core at CLI startup
import type { OutputFormat, SetupBlock } from './types'
import { runValidate } from './validate-command'
import { loadDefinition, loadSetup } from './validation'

declare const __TESTREEL_VERSION__: string

const program = new Command()
  .name('testreel')
  .description('Programmatic video recordings for web apps')
  .version(__TESTREEL_VERSION__, '-v, --version')
  .enablePositionalOptions()

// --- Recording command (default) ---
program
  .argument(
    '<definition>',
    'Path to a recording definition file (.json, .jsonc, .yaml, .yml)',
  )
  .option('-o, --output <dir>', 'Output directory', './testreel-output')
  .option(
    '--setup <file>',
    'Setup file (login, dismiss modals, etc.) — runs before recording',
  )
  .option('--format <fmt>', 'Output format: webm, mp4, gif')
  .option('--speed <n>', 'Playback speed multiplier')
  .option('--headed', 'Run browser in headed mode')
  .option(
    '--dry-run',
    'Validate definition and print summary without launching a browser',
  )
  .option('--verbose', 'Enable detailed output (per-step timing, diagnostics)')
  .option('--quiet', 'Suppress all output except errors and final output paths')
  .option('--clean', 'Remove previous output files before recording')
  .option('--keep-intermediates', 'Keep intermediate files (cursor JSON, etc.)')
  .action(
    async (
      defPath: string,
      opts: {
        output: string
        setup?: string
        format?: string
        speed?: string
        headed?: boolean
        dryRun?: boolean
        verbose?: boolean
        quiet?: boolean
        clean?: boolean
        keepIntermediates?: boolean
      },
    ) => {
      // Set log level
      if (opts.verbose && opts.quiet) {
        console.error('Error: --verbose and --quiet are mutually exclusive')
        process.exit(1)
      }
      if (opts.verbose) setLogLevel('verbose')
      if (opts.quiet) setLogLevel('quiet')

      // --- Dry run: print summary and exit ---
      if (opts.dryRun) {
        runValidate(defPath, { setup: opts.setup })
        return // runValidate calls process.exit, but guard anyway
      }

      // Start loading recorder in background (includes playwright-core)
      const recorderPromise = import('./recorder')

      // Validate --format
      let outputFormat: OutputFormat | undefined
      if (opts.format) {
        if (
          opts.format !== 'webm' &&
          opts.format !== 'mp4' &&
          opts.format !== 'gif'
        ) {
          console.error(
            `Error: --format must be one of: webm, mp4, gif (got '${opts.format}')`,
          )
          process.exit(1)
        }
        outputFormat = opts.format
      }

      // Validate --speed
      let speed: number | undefined
      if (opts.speed) {
        speed = parseFloat(opts.speed)
        if (isNaN(speed) || speed <= 0) {
          console.error('Error: --speed must be a number greater than 0')
          process.exit(1)
        }
      }

      // Load and validate definition
      let def
      try {
        def = loadDefinition(defPath)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Error: ${msg}`)
        process.exit(1)
      }

      // Load external setup file if provided
      let setup: SetupBlock | undefined
      if (opts.setup) {
        try {
          setup = loadSetup(opts.setup)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`Error: ${msg}`)
          process.exit(1)
        }
      }

      // --- Normal recording ---
      const hasSetup = setup ?? def.setup
      if (!opts.quiet) {
        if (hasSetup) {
          console.log(
            `testreel: ${hasSetup.steps.length} setup steps + ${def.steps.length} recording steps → ${def.url}\n`,
          )
        } else {
          console.log(`testreel: ${def.steps.length} steps → ${def.url}\n`)
        }
      }

      try {
        const { record } = await recorderPromise
        const result = await record(defPath, {
          outputDir: opts.output,
          headless: !opts.headed,
          setup,
          outputFormat,
          speed,
          clean: opts.clean,
          keepIntermediates: opts.keepIntermediates,
        })

        if (!opts.quiet) {
          console.log('\nDone!')
        }
        if (result.video) {
          console.log(`  Video: ${result.video}`)
        }
        if (result.screenshots.length > 0) {
          console.log(`  Screenshots: ${result.screenshots.length} file(s)`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Error: ${msg}`)
        process.exit(1)
      }
    },
  )

// --- Validate subcommand ---
program
  .command('validate <file>')
  .description(
    'Validate a recording definition and print a summary (exit 0 = valid, exit 1 = invalid)',
  )
  .option('--setup <file>', 'Setup file to validate alongside the definition')
  .option('--quiet', 'Exit silently on success, print errors on failure')
  .action((file: string, opts: { setup?: string; quiet?: boolean }) => {
    runValidate(file, opts)
  })

// --- Init subcommand ---
program
  .command('init')
  .description('Interactively create a new recording definition')
  .action(async () => {
    const { runInit } = await import('./init')
    await runInit()
  })

// --- Login subcommand ---
program
  .command('login <url>')
  .description('Open a browser to log in manually, then save session state')
  .requiredOption(
    '--save-state <file>',
    'Path to save the exported session state',
  )
  .option(
    '--channel <name>',
    'Browser channel (e.g. "chrome") — use for OAuth providers that block Chromium',
  )
  .option('--cdp <url>', 'Connect to an existing browser via CDP')
  .option('--remote', 'Launch headless browser with web-based viewer')
  .option('--port <number>', 'Viewer port for --remote mode (default: 9222)')
  .action(
    async (
      url: string,
      opts: {
        saveState: string
        channel?: string
        cdp?: string
        remote?: boolean
        port?: string
      },
    ) => {
      // Start loading login module in background (includes playwright-core)
      const loginPromise = import('./login')

      if (opts.remote && opts.cdp) {
        console.error('Error: --remote and --cdp are mutually exclusive')
        process.exit(1)
      }

      let port: number | undefined
      if (opts.port) {
        port = parseInt(opts.port, 10)
        if (isNaN(port)) {
          console.error('Error: --port must be a number')
          process.exit(1)
        }
      }

      try {
        const { login } = await loginPromise
        await login({
          url,
          saveState: opts.saveState,
          channel: opts.channel,
          cdpUrl: opts.cdp,
          remote: opts.remote,
          port,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Error: ${msg}`)
        process.exit(1)
      }
    },
  )

program.parse()
