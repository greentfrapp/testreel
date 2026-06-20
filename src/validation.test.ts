import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadDefinition, loadSetup } from './validation'

function minimalDef(overrides: Record<string, unknown> = {}) {
  return {
    url: 'https://example.com',
    steps: [{ action: 'wait', ms: 100 }],
    ...overrides,
  }
}

function writeTempJson(obj: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testreel-test-'))
  const file = path.join(dir, 'def.json')
  fs.writeFileSync(file, JSON.stringify(obj))
  return file
}

describe('loadDefinition', () => {
  describe('env var substitution', () => {
    const savedEnv: Record<string, string | undefined> = {}

    beforeEach(() => {
      for (const key of ['TEST_URL', 'TEST_TOKEN', 'TEST_KEY', 'MY_VAR']) {
        savedEnv[key] = process.env[key]
      }
    })

    afterEach(() => {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    })

    it('substitutes $VAR syntax in top-level strings', () => {
      process.env.TEST_URL = 'https://resolved.example.com'
      const def = loadDefinition(minimalDef({ url: '$TEST_URL' }))
      expect(def.url).toBe('https://resolved.example.com')
    })

    it('substitutes ${VAR} syntax in top-level strings', () => {
      process.env.TEST_URL = 'https://resolved.example.com'
      const def = loadDefinition(minimalDef({ url: '${TEST_URL}' }))
      expect(def.url).toBe('https://resolved.example.com')
    })

    it('substitutes env vars embedded in a larger string', () => {
      process.env.TEST_TOKEN = 'abc123'
      const def = loadDefinition(
        minimalDef({ headers: { Authorization: 'Bearer ${TEST_TOKEN}' } }),
      )
      expect(def.headers!.Authorization).toBe('Bearer abc123')
    })

    it('substitutes multiple env vars in the same string', () => {
      process.env.TEST_URL = 'example.com'
      process.env.TEST_TOKEN = 'tok'
      const def = loadDefinition(
        minimalDef({ url: 'https://$TEST_URL/path?t=${TEST_TOKEN}' }),
      )
      expect(def.url).toBe('https://example.com/path?t=tok')
    })

    it('substitutes env vars in localStorage values', () => {
      process.env.TEST_TOKEN = 'session-value'
      const def = loadDefinition(
        minimalDef({ localStorage: { 'auth-token': '$TEST_TOKEN' } }),
      )
      expect(def.localStorage!['auth-token']).toBe('session-value')
    })

    it('substitutes env vars in headers', () => {
      process.env.TEST_KEY = 'key-123'
      const def = loadDefinition(
        minimalDef({ headers: { 'X-Api-Key': '${TEST_KEY}' } }),
      )
      expect(def.headers!['X-Api-Key']).toBe('key-123')
    })

    it('substitutes env vars in step values', () => {
      process.env.MY_VAR = 'hello'
      const def = loadDefinition({
        url: 'https://example.com',
        steps: [{ action: 'fill', selector: '#input', text: '$MY_VAR' }],
      })
      expect(def.steps[0]).toMatchObject({ text: 'hello' })
    })

    it('substitutes env vars in cookie values', () => {
      process.env.TEST_TOKEN = 'cookie-val'
      const def = loadDefinition(
        minimalDef({
          cookies: [
            {
              name: 'session',
              value: '$TEST_TOKEN',
              domain: '.example.com',
              path: '/',
            },
          ],
        }),
      )
      expect(def.cookies![0].value).toBe('cookie-val')
    })

    it('throws when an env var is not set ($VAR syntax)', () => {
      delete process.env.NONEXISTENT_VAR
      expect(() =>
        loadDefinition(minimalDef({ url: '$NONEXISTENT_VAR' })),
      ).toThrow("Environment variable 'NONEXISTENT_VAR' is not set")
    })

    it('throws when an env var is not set (${VAR} syntax)', () => {
      delete process.env.NONEXISTENT_VAR
      expect(() =>
        loadDefinition(minimalDef({ url: '${NONEXISTENT_VAR}' })),
      ).toThrow("Environment variable 'NONEXISTENT_VAR' is not set")
    })

    it('leaves strings without env var references unchanged', () => {
      const def = loadDefinition(minimalDef({ url: 'https://example.com' }))
      expect(def.url).toBe('https://example.com')
    })

    it('substitutes env vars with empty string values', () => {
      process.env.TEST_TOKEN = ''
      const def = loadDefinition(
        minimalDef({ url: 'https://example.com/$TEST_TOKEN' }),
      )
      expect(def.url).toBe('https://example.com/')
    })

    it('works when loading from a JSON file', () => {
      process.env.TEST_TOKEN = 'from-file'
      const file = writeTempJson({
        url: 'https://example.com',
        localStorage: { token: '${TEST_TOKEN}' },
        steps: [{ action: 'wait', ms: 100 }],
      })
      const def = loadDefinition(file)
      expect(def.localStorage!.token).toBe('from-file')
      fs.rmSync(path.dirname(file), { recursive: true })
    })

    it('does not substitute in non-string values', () => {
      const def = loadDefinition(
        minimalDef({ viewport: { width: 1280, height: 720 } }),
      )
      expect(def.viewport).toEqual({ width: 1280, height: 720 })
    })
  })

  describe('inline setup block validation', () => {
    it('accepts a definition with a valid setup block', () => {
      const def = loadDefinition(
        minimalDef({
          setup: {
            url: 'https://example.com/login',
            steps: [
              { action: 'fill', selector: '#email', text: 'user@test.com' },
              { action: 'click', selector: 'button[type=submit]' },
            ],
          },
        }),
      )
      expect(def.setup).toBeDefined()
      expect(def.setup!.steps).toHaveLength(2)
      expect(def.setup!.url).toBe('https://example.com/login')
    })

    it('accepts a setup block without a url', () => {
      const def = loadDefinition(
        minimalDef({
          setup: {
            steps: [{ action: 'click', selector: '.dismiss' }],
          },
        }),
      )
      expect(def.setup!.url).toBeUndefined()
      expect(def.setup!.steps).toHaveLength(1)
    })

    it('throws when setup steps is empty', () => {
      expect(() =>
        loadDefinition(minimalDef({ setup: { steps: [] } })),
      ).toThrow("Setup block must include a non-empty 'steps' array")
    })

    it('throws when setup steps is missing', () => {
      expect(() => loadDefinition(minimalDef({ setup: {} }))).toThrow(
        "Setup block must include a non-empty 'steps' array",
      )
    })

    it('validates setup steps like regular steps', () => {
      expect(() =>
        loadDefinition(
          minimalDef({
            setup: { steps: [{ action: 'click' }] },
          }),
        ),
      ).toThrow("Setup step 0 ('click'): missing required 'selector' field")
    })

    it('throws for unknown action in setup steps', () => {
      expect(() =>
        loadDefinition(
          minimalDef({
            setup: { steps: [{ action: 'bogus' }] },
          }),
        ),
      ).toThrow("Setup step 0: unknown action 'bogus'")
    })

    it('throws for missing text in setup fill step', () => {
      expect(() =>
        loadDefinition(
          minimalDef({
            setup: { steps: [{ action: 'fill', selector: '#input' }] },
          }),
        ),
      ).toThrow("Setup step 0 ('fill'): missing required 'text' field")
    })
  })

  describe('setup block env var substitution', () => {
    const savedEnv: Record<string, string | undefined> = {}

    beforeEach(() => {
      for (const key of ['SETUP_EMAIL', 'SETUP_PASSWORD']) {
        savedEnv[key] = process.env[key]
      }
    })

    afterEach(() => {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    })

    it('substitutes env vars in setup step values', () => {
      process.env.SETUP_EMAIL = 'test@example.com'
      process.env.SETUP_PASSWORD = 'secret123'
      const def = loadDefinition(
        minimalDef({
          setup: {
            steps: [
              { action: 'fill', selector: '#email', text: '$SETUP_EMAIL' },
              {
                action: 'fill',
                selector: '#password',
                text: '${SETUP_PASSWORD}',
              },
            ],
          },
        }),
      )
      expect(def.setup!.steps[0]).toMatchObject({ text: 'test@example.com' })
      expect(def.setup!.steps[1]).toMatchObject({ text: 'secret123' })
    })

    it('substitutes env vars in setup url', () => {
      process.env.SETUP_EMAIL = 'https://login.example.com'
      const def = loadDefinition(
        minimalDef({
          setup: {
            url: '$SETUP_EMAIL',
            steps: [{ action: 'wait', ms: 100 }],
          },
        }),
      )
      expect(def.setup!.url).toBe('https://login.example.com')
    })
  })

  describe('auth block validation', () => {
    const savedAuthEnv: Record<string, string | undefined> = {}

    beforeEach(() => {
      for (const key of ['TEST_URL', 'TEST_KEY']) {
        savedAuthEnv[key] = process.env[key]
      }
    })

    afterEach(() => {
      for (const [key, value] of Object.entries(savedAuthEnv)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    })

    it('accepts a definition with a valid supabase auth block', () => {
      const def = loadDefinition(
        minimalDef({
          auth: {
            provider: 'supabase',
            url: 'https://abc123.supabase.co',
            serviceRoleKey: 'key-123',
            email: 'demo@example.com',
          },
        }),
      )
      expect(def.auth).toBeDefined()
      expect(def.auth!.provider).toBe('supabase')
    })

    it('throws when auth block is missing provider', () => {
      expect(() =>
        loadDefinition(minimalDef({ auth: { url: 'https://x.supabase.co' } })),
      ).toThrow("Auth block must include a 'provider' field")
    })

    it('throws for unknown auth provider', () => {
      expect(() =>
        loadDefinition(
          minimalDef({
            auth: { provider: 'firebase', url: 'x', key: 'y', email: 'z' },
          }),
        ),
      ).toThrow("Unknown auth provider: 'firebase'")
    })

    it('throws when supabase auth is missing url', () => {
      expect(() =>
        loadDefinition(
          minimalDef({
            auth: { provider: 'supabase', serviceRoleKey: 'k', email: 'e' },
          }),
        ),
      ).toThrow("Supabase auth: missing 'url' field")
    })

    it('throws when supabase auth is missing serviceRoleKey', () => {
      expect(() =>
        loadDefinition(
          minimalDef({
            auth: {
              provider: 'supabase',
              url: 'https://x.supabase.co',
              email: 'e',
            },
          }),
        ),
      ).toThrow("Supabase auth: missing 'serviceRoleKey' field")
    })

    it('throws when supabase auth is missing email', () => {
      expect(() =>
        loadDefinition(
          minimalDef({
            auth: {
              provider: 'supabase',
              url: 'https://x.supabase.co',
              serviceRoleKey: 'k',
            },
          }),
        ),
      ).toThrow("Supabase auth: missing 'email' field")
    })

    it('substitutes env vars in auth block fields', () => {
      process.env.TEST_URL = 'https://abc123.supabase.co'
      process.env.TEST_KEY = 'service-key-123'
      const def = loadDefinition(
        minimalDef({
          auth: {
            provider: 'supabase',
            url: '$TEST_URL',
            serviceRoleKey: '${TEST_KEY}',
            email: 'demo@example.com',
          },
        }),
      )
      expect(def.auth!.url).toBe('https://abc123.supabase.co')
      expect((def.auth as any).serviceRoleKey).toBe('service-key-123')
    })
  })

  describe('per-step timeout validation', () => {
    it('accepts a valid timeout value', () => {
      const def = loadDefinition(
        minimalDef({
          steps: [{ action: 'click', selector: '#btn', timeout: 3000 }],
        }),
      )
      expect(def.steps[0]).toMatchObject({ timeout: 3000 })
    })

    it('throws when timeout is zero', () => {
      expect(() =>
        loadDefinition(
          minimalDef({
            steps: [{ action: 'click', selector: '#btn', timeout: 0 }],
          }),
        ),
      ).toThrow("'timeout' must be a number greater than 0")
    })

    it('throws when timeout is negative', () => {
      expect(() =>
        loadDefinition(
          minimalDef({
            steps: [{ action: 'wait', timeout: -500 }],
          }),
        ),
      ).toThrow("'timeout' must be a number greater than 0")
    })

    it('throws when timeout is a string', () => {
      expect(() =>
        loadDefinition(
          minimalDef({
            steps: [{ action: 'click', selector: '#btn', timeout: '5s' }],
          }),
        ),
      ).toThrow("'timeout' must be a number greater than 0")
    })
  })

  describe('waitFor field validation', () => {
    it('accepts a CSS selector as waitFor', () => {
      const def = loadDefinition(
        minimalDef({
          steps: [
            { action: 'click', selector: '#btn', waitFor: '.content-loaded' },
          ],
        }),
      )
      expect(def.steps[0]).toMatchObject({ waitFor: '.content-loaded' })
    })

    it('accepts networkidle as waitFor', () => {
      const def = loadDefinition(
        minimalDef({
          steps: [{ action: 'screenshot', waitFor: 'networkidle' }],
        }),
      )
      expect(def.steps[0]).toMatchObject({ waitFor: 'networkidle' })
    })

    it('throws when waitFor is not a string', () => {
      expect(() =>
        loadDefinition(
          minimalDef({
            steps: [{ action: 'click', selector: '#btn', waitFor: true }],
          }),
        ),
      ).toThrow("'waitFor' must be a string")
    })

    it('throws when waitFor is a number', () => {
      expect(() =>
        loadDefinition(
          minimalDef({
            steps: [{ action: 'click', selector: '#btn', waitFor: 5000 }],
          }),
        ),
      ).toThrow("'waitFor' must be a string")
    })
  })

  describe('waitForNetwork action validation', () => {
    it('accepts a valid waitForNetwork step', () => {
      const def = loadDefinition(
        minimalDef({
          steps: [{ action: 'waitForNetwork', urlPattern: '/api/users' }],
        }),
      )
      expect(def.steps[0]).toMatchObject({
        action: 'waitForNetwork',
        urlPattern: '/api/users',
      })
    })

    it('throws when urlPattern is missing', () => {
      expect(() =>
        loadDefinition(
          minimalDef({
            steps: [{ action: 'waitForNetwork' }],
          }),
        ),
      ).toThrow("missing required 'urlPattern' field")
    })

    it('accepts waitForNetwork with custom timeout', () => {
      const def = loadDefinition(
        minimalDef({
          steps: [
            { action: 'waitForNetwork', urlPattern: '/api', timeout: 15000 },
          ],
        }),
      )
      expect(def.steps[0]).toMatchObject({ urlPattern: '/api', timeout: 15000 })
    })

    it('error includes step snippet for waitForNetwork', () => {
      try {
        loadDefinition(
          minimalDef({
            steps: [{ action: 'waitForNetwork' }],
          }),
        )
        expect.fail('should have thrown')
      } catch (err) {
        const msg = (err as Error).message
        expect(msg).toContain("missing required 'urlPattern' field")
        expect(msg).toContain('"waitForNetwork"')
      }
    })
  })

  describe('existing validation', () => {
    it('throws when url is missing', () => {
      expect(() => loadDefinition({ steps: [{ action: 'wait' }] })).toThrow(
        "must include a 'url' field",
      )
    })

    it('throws when steps is empty', () => {
      expect(() =>
        loadDefinition({ url: 'https://example.com', steps: [] }),
      ).toThrow("must include a non-empty 'steps' array")
    })

    it('throws for unknown action', () => {
      expect(() =>
        loadDefinition({
          url: 'https://example.com',
          steps: [{ action: 'bogus' }],
        }),
      ).toThrow("unknown action 'bogus'")
    })

    it('throws when click is missing selector', () => {
      expect(() =>
        loadDefinition({
          url: 'https://example.com',
          steps: [{ action: 'click' }],
        }),
      ).toThrow("missing required 'selector' field")
    })

    it('throws when fill is missing text', () => {
      expect(() =>
        loadDefinition({
          url: 'https://example.com',
          steps: [{ action: 'fill', selector: '#x' }],
        }),
      ).toThrow("missing required 'text' field")
    })

    it('accepts a valid definition', () => {
      const def = loadDefinition(minimalDef())
      expect(def.url).toBe('https://example.com')
      expect(def.steps).toHaveLength(1)
    })
  })

  describe('error context includes JSON snippet', () => {
    it('includes the step JSON in error messages', () => {
      try {
        loadDefinition({
          url: 'https://example.com',
          steps: [{ action: 'click' }],
        })
        expect.fail('should have thrown')
      } catch (err) {
        const msg = (err as Error).message
        expect(msg).toContain("missing required 'selector' field")
        expect(msg).toContain('{"action":"click"}')
      }
    })
  })

  describe('JSONC file support', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testreel-jsonc-test-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('parses .jsonc files with comments', () => {
      const filePath = path.join(tmpDir, 'def.jsonc')
      fs.writeFileSync(
        filePath,
        `{
        // This is a comment
        "url": "https://example.com",
        "steps": [{ "action": "wait", "ms": 100 }]
      }`,
      )
      const def = loadDefinition(filePath)
      expect(def.url).toBe('https://example.com')
      expect(def.steps).toHaveLength(1)
    })
  })

  describe('YAML file support', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testreel-yaml-test-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('parses .yaml files', () => {
      const filePath = path.join(tmpDir, 'def.yaml')
      fs.writeFileSync(
        filePath,
        `
url: https://example.com
steps:
  - action: wait
    ms: 100
`,
      )
      const def = loadDefinition(filePath)
      expect(def.url).toBe('https://example.com')
      expect(def.steps).toHaveLength(1)
    })

    it('parses .yml files', () => {
      const filePath = path.join(tmpDir, 'def.yml')
      fs.writeFileSync(
        filePath,
        `
url: https://example.com
steps:
  - action: click
    selector: "#btn"
`,
      )
      const def = loadDefinition(filePath)
      expect(def.url).toBe('https://example.com')
      expect(def.steps[0]).toMatchObject({ action: 'click', selector: '#btn' })
    })
  })
})

describe('loadSetup', () => {
  it('accepts a valid setup object', () => {
    const setup = loadSetup({
      url: 'https://example.com/login',
      steps: [{ action: 'click', selector: '#btn' }],
    })
    expect(setup.url).toBe('https://example.com/login')
    expect(setup.steps).toHaveLength(1)
  })

  it('accepts a setup without url', () => {
    const setup = loadSetup({
      steps: [{ action: 'wait', ms: 500 }],
    })
    expect(setup.url).toBeUndefined()
    expect(setup.steps).toHaveLength(1)
  })

  it('throws when steps is empty', () => {
    expect(() => loadSetup({ steps: [] })).toThrow(
      "Setup file must include a non-empty 'steps' array",
    )
  })

  it('throws when steps is missing', () => {
    expect(() => loadSetup({})).toThrow(
      "Setup file must include a non-empty 'steps' array",
    )
  })

  it('validates step fields', () => {
    expect(() => loadSetup({ steps: [{ action: 'click' }] })).toThrow(
      "missing required 'selector' field",
    )
  })

  it('throws for unknown action', () => {
    expect(() => loadSetup({ steps: [{ action: 'nope' }] })).toThrow(
      "unknown action 'nope'",
    )
  })

  describe('from file', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testreel-setup-test-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('loads a valid setup JSON file', () => {
      const filePath = path.join(tmpDir, 'setup.json')
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          url: 'https://example.com/login',
          steps: [{ action: 'wait', ms: 100 }],
        }),
      )
      const setup = loadSetup(filePath)
      expect(setup.url).toBe('https://example.com/login')
      expect(setup.steps).toHaveLength(1)
    })

    it('throws for non-existent file', () => {
      expect(() => loadSetup('/tmp/does-not-exist-xyz.json')).toThrow(
        'Failed to read setup file',
      )
    })

    it('throws for invalid JSON', () => {
      const filePath = path.join(tmpDir, 'bad.json')
      fs.writeFileSync(filePath, 'not json{{{')
      expect(() => loadSetup(filePath)).toThrow('Failed to parse setup file')
    })
  })

  describe('env var substitution', () => {
    const savedEnv: Record<string, string | undefined> = {}

    beforeEach(() => {
      for (const key of ['SETUP_VAR']) {
        savedEnv[key] = process.env[key]
      }
    })

    afterEach(() => {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    })

    it('substitutes env vars in setup step text', () => {
      process.env.SETUP_VAR = 'resolved'
      const setup = loadSetup({
        steps: [{ action: 'fill', selector: '#input', text: '$SETUP_VAR' }],
      })
      expect(setup.steps[0]).toMatchObject({ text: 'resolved' })
    })

    it('substitutes env vars in setup url', () => {
      process.env.SETUP_VAR = 'https://login.example.com'
      const setup = loadSetup({
        url: '${SETUP_VAR}',
        steps: [{ action: 'wait', ms: 100 }],
      })
      expect(setup.url).toBe('https://login.example.com')
    })

    it('substitutes env vars when loading from file', () => {
      process.env.SETUP_VAR = 'file-resolved'
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'testreel-setup-env-'),
      )
      const filePath = path.join(tmpDir, 'setup.json')
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          steps: [{ action: 'fill', selector: '#x', text: '$SETUP_VAR' }],
        }),
      )
      const setup = loadSetup(filePath)
      expect(setup.steps[0]).toMatchObject({ text: 'file-resolved' })
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })
  })
})

describe('narration validation', () => {
  it('accepts a string narrate field on a step', () => {
    const def = loadDefinition(
      minimalDef({ steps: [{ action: 'wait', ms: 100, narrate: 'hello' }] }),
    )
    expect(def.steps[0]).toMatchObject({ narrate: 'hello' })
  })

  it('accepts an object narrate field with text and overrides', () => {
    const def = loadDefinition(
      minimalDef({
        steps: [
          { action: 'wait', ms: 100, narrate: { text: 'hi', voice: 'nova' } },
        ],
      }),
    )
    expect(def.steps[0]).toMatchObject({
      narrate: { text: 'hi', voice: 'nova' },
    })
  })

  it('rejects an empty narrate string', () => {
    expect(() =>
      loadDefinition(
        minimalDef({ steps: [{ action: 'wait', ms: 100, narrate: '  ' }] }),
      ),
    ).toThrow(/'narrate' must be a non-empty string/)
  })

  it('rejects a narrate object without text', () => {
    expect(() =>
      loadDefinition(
        minimalDef({
          steps: [{ action: 'wait', ms: 100, narrate: { voice: 'nova' } }],
        }),
      ),
    ).toThrow(/'narrate' must be a non-empty string or an object with a 'text'/)
  })

  it('accepts a valid narration block', () => {
    const def = loadDefinition(
      minimalDef({
        narration: {
          provider: 'openai',
          voice: 'alloy',
          format: 'opus',
          cues: [
            { at: 'start', text: 'Intro' },
            { at: 'end', text: 'Outro' },
          ],
        },
      }),
    )
    expect(def.narration?.cues).toHaveLength(2)
  })

  it('rejects an unknown narration provider', () => {
    expect(() =>
      loadDefinition(minimalDef({ narration: { provider: 'acme' } })),
    ).toThrow(/unknown provider 'acme'/)
  })

  it('rejects an invalid narration format', () => {
    expect(() =>
      loadDefinition(minimalDef({ narration: { format: 'flac' } })),
    ).toThrow(/'format' must be one of/)
  })

  it('rejects a cue with an invalid `at`', () => {
    expect(() =>
      loadDefinition(
        minimalDef({ narration: { cues: [{ at: 'middle', text: 'x' }] } }),
      ),
    ).toThrow(/'at' must be 'start' or 'end'/)
  })

  it('rejects a cue without text', () => {
    expect(() =>
      loadDefinition(minimalDef({ narration: { cues: [{ at: 'start' }] } })),
    ).toThrow(/missing required non-empty 'text'/)
  })
})
