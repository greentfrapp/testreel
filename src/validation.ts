import fs from 'fs'
import { parse as parseJsonc } from 'jsonc-parser'
import path from 'path'
import { parse as parseYaml } from 'yaml'
import { ACTIONS } from './actions'
import type { RecordingDefinition, SetupBlock, Step } from './types'

const ENV_VAR_PATTERN = /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g

function substituteEnvVars(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (match, braced, bare) => {
    const name = braced ?? bare
    const resolved = process.env[name]
    if (resolved === undefined) {
      throw new Error(
        `Environment variable '${name}' is not set (referenced as '${match}')`,
      )
    }
    return resolved
  })
}

function substituteDeep<T>(obj: T): T {
  if (typeof obj === 'string') {
    return substituteEnvVars(obj) as T
  }
  if (Array.isArray(obj)) {
    return obj.map(substituteDeep) as T
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteDeep(value)
    }
    return result as T
  }
  return obj
}

/** Parse a file as JSON (with comments), YAML, or plain JSON based on extension. */
function parseFile(filePath: string, raw: string): unknown {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.yaml' || ext === '.yml') {
    return parseYaml(raw)
  }
  // .jsonc files use the JSONC parser (strips comments before parsing)
  if (ext === '.jsonc') {
    const errors: import('jsonc-parser').ParseError[] = []
    const result = parseJsonc(raw, errors)
    if (errors.length > 0) {
      throw new SyntaxError(`JSONC parse error at offset ${errors[0].offset}`)
    }
    return result
  }
  // .json and other extensions — use strict JSON.parse for clear error messages
  return JSON.parse(raw)
}

function formatStepSnippet(step: Record<string, unknown>): string {
  const compact = JSON.stringify(step)
  if (compact.length <= 120) return compact
  return compact.slice(0, 117) + '...'
}

export function loadDefinition(input: string | object): RecordingDefinition {
  let def: RecordingDefinition

  if (typeof input === 'string') {
    let raw: string
    try {
      raw = fs.readFileSync(input, 'utf-8')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to read recording definition '${input}': ${msg}`)
    }
    try {
      def = parseFile(input, raw) as RecordingDefinition
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to parse recording definition '${input}': ${msg}`)
    }
  } else {
    def = input as RecordingDefinition
  }

  def = substituteDeep(def)

  if (!def.url) {
    throw new Error("Recording definition must include a 'url' field")
  }

  if (!Array.isArray(def.steps) || def.steps.length === 0) {
    throw new Error(
      "Recording definition must include a non-empty 'steps' array",
    )
  }

  validateSteps(def.steps, 'Step')

  if (def.auth) {
    if (!def.auth.provider) {
      throw new Error("Auth block must include a 'provider' field")
    }
    if (def.auth.provider === 'supabase') {
      if (!def.auth.url) throw new Error("Supabase auth: missing 'url' field")
      if (!def.auth.serviceRoleKey)
        throw new Error("Supabase auth: missing 'serviceRoleKey' field")
      if (!def.auth.email)
        throw new Error("Supabase auth: missing 'email' field")
    } else {
      throw new Error(`Unknown auth provider: '${def.auth.provider}'`)
    }
  }

  if (
    def.cursor !== undefined &&
    typeof def.cursor !== 'boolean' &&
    typeof def.cursor !== 'object'
  ) {
    throw new Error("'cursor' must be a boolean or an object")
  }

  if (def.outputFormat !== undefined) {
    const validFormats = ['webm', 'mp4', 'gif']
    if (!validFormats.includes(def.outputFormat)) {
      throw new Error(
        `'outputFormat' must be one of: ${validFormats.join(', ')} (got '${def.outputFormat}')`,
      )
    }
  }

  if (def.speed !== undefined) {
    if (typeof def.speed !== 'number' || def.speed <= 0) {
      throw new Error("'speed' must be a number greater than 0")
    }
  }

  if (def.setup) {
    if (!Array.isArray(def.setup.steps) || def.setup.steps.length === 0) {
      throw new Error("Setup block must include a non-empty 'steps' array")
    }
    validateSteps(def.setup.steps, 'Setup step')
  }

  return def
}

function validateSteps(steps: Step[], prefix: string): void {
  const selectorRequired = new Set([
    'click',
    'type',
    'clear',
    'fill',
    'select',
    'hover',
  ])
  const textRequired = new Set(['type', 'fill'])

  for (const [i, step] of steps.entries()) {
    const snippet = formatStepSnippet(
      step as unknown as Record<string, unknown>,
    )

    if (!step.action) {
      throw new Error(`${prefix} ${i} missing 'action' field\n  → ${snippet}`)
    }
    if (!ACTIONS[step.action]) {
      throw new Error(
        `${prefix} ${i}: unknown action '${step.action}'\n  → ${snippet}`,
      )
    }
    if (
      selectorRequired.has(step.action) &&
      !('selector' in step && step.selector)
    ) {
      throw new Error(
        `${prefix} ${i} ('${step.action}'): missing required 'selector' field\n  → ${snippet}`,
      )
    }
    if (
      textRequired.has(step.action) &&
      !('text' in step && step.text !== undefined)
    ) {
      throw new Error(
        `${prefix} ${i} ('${step.action}'): missing required 'text' field\n  → ${snippet}`,
      )
    }
    if (step.action === 'keyboard' && !('key' in step && step.key)) {
      throw new Error(
        `${prefix} ${i} ('keyboard'): missing required 'key' field\n  → ${snippet}`,
      )
    }
    if (step.action === 'navigate' && !('url' in step && step.url)) {
      throw new Error(
        `${prefix} ${i} ('navigate'): missing required 'url' field\n  → ${snippet}`,
      )
    }
    if (
      step.speed !== undefined &&
      (typeof step.speed !== 'number' || step.speed <= 0)
    ) {
      throw new Error(
        `${prefix} ${i}: 'speed' must be a number greater than 0\n  → ${snippet}`,
      )
    }
    if (
      step.timeout !== undefined &&
      (typeof step.timeout !== 'number' || step.timeout <= 0)
    ) {
      throw new Error(
        `${prefix} ${i}: 'timeout' must be a number greater than 0\n  → ${snippet}`,
      )
    }
    if (step.waitFor !== undefined && typeof step.waitFor !== 'string') {
      throw new Error(
        `${prefix} ${i}: 'waitFor' must be a string (selector or 'networkidle')\n  → ${snippet}`,
      )
    }
    if (
      step.action === 'waitForNetwork' &&
      !('urlPattern' in step && step.urlPattern)
    ) {
      throw new Error(
        `${prefix} ${i} ('waitForNetwork'): missing required 'urlPattern' field\n  → ${snippet}`,
      )
    }
  }
}

export function loadSetup(input: string | object): SetupBlock {
  let setup: SetupBlock

  if (typeof input === 'string') {
    let raw: string
    try {
      raw = fs.readFileSync(input, 'utf-8')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to read setup file '${input}': ${msg}`)
    }
    try {
      setup = parseFile(input, raw) as SetupBlock
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to parse setup file '${input}': ${msg}`)
    }
  } else {
    setup = input as SetupBlock
  }

  setup = substituteDeep(setup)

  if (!Array.isArray(setup.steps) || setup.steps.length === 0) {
    throw new Error("Setup file must include a non-empty 'steps' array")
  }

  validateSteps(setup.steps, 'Setup step')

  return setup
}
