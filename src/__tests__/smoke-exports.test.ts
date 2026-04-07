import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

describe('package distribution', () => {
  it('package.json has correct export map', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'),
    )

    // Main entry
    expect(pkg.exports['.']).toEqual({
      types: './dist/index.d.ts',
      import: './dist/index.js',
      require: './dist/index.cjs',
    })

    // Playwright subpath
    expect(pkg.exports['./playwright']).toEqual({
      types: './dist/fixture.d.ts',
      import: './dist/fixture.js',
      require: './dist/fixture.cjs',
    })

    // CLI binary
    expect(pkg.bin.testreel).toBe('dist/cli.cjs')
  })

  it('package.json has required metadata for npm', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'),
    )

    expect(pkg.name).toBe('testreel')
    expect(pkg.license).toBe('MIT')
    expect(pkg.repository).toBeDefined()
    expect(pkg.description).toBeTruthy()
    expect(pkg.keywords.length).toBeGreaterThan(0)
    expect(pkg.engines.node).toBe('>=20')
  })

  it('package.json files field restricts published contents', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'),
    )

    expect(pkg.files).toContain('dist')
    expect(pkg.files).toContain('recording-definition.schema.json')
  })
})
