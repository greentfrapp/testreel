import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanOutputDir, sanitizeFilename, timestamp } from '../utils'

describe('timestamp', () => {
  it('returns a string matching YYYY-MM-DD_HH-MM-SS-mmm format', () => {
    const ts = timestamp()
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}$/)
  })

  it('returns different values on successive calls (or at least valid ones)', () => {
    const a = timestamp()
    const b = timestamp()
    // Both should be valid format
    expect(a).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}$/)
    expect(b).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}$/)
  })
})

describe('sanitizeFilename', () => {
  it('passes through clean filenames unchanged', () => {
    expect(sanitizeFilename('my-screenshot')).toBe('my-screenshot')
    expect(sanitizeFilename('step_01')).toBe('step_01')
  })

  it('replaces dots and special characters with underscores', () => {
    expect(sanitizeFilename('foo..bar')).toBe('foo__bar')
    expect(sanitizeFilename('../../etc/passwd')).toBe('______etc_passwd')
  })

  it('replaces forward slashes with underscores', () => {
    expect(sanitizeFilename('path/to/file')).toBe('path_to_file')
  })

  it('replaces backslashes with underscores', () => {
    expect(sanitizeFilename('path\\to\\file')).toBe('path_to_file')
  })

  it('strips Windows-reserved and special characters', () => {
    expect(sanitizeFilename('file:name*?.png')).toBe('file_name___png')
    expect(sanitizeFilename('hello <world>')).toBe('hello__world_')
  })

  it('handles combined traversal attempts', () => {
    const result = sanitizeFilename('../../../secret')
    expect(result).not.toContain('..')
    expect(result).not.toContain('/')
  })
})

describe('cleanOutputDir', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testreel-clean-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('removes testreel output files (.webm, .mp4, .gif, .png, .json)', () => {
    const files = ['video.webm', 'clip.mp4', 'anim.gif', 'shot.png', 'out.json']
    for (const f of files) fs.writeFileSync(path.join(tmpDir, f), '')

    cleanOutputDir(tmpDir)

    expect(fs.readdirSync(tmpDir)).toEqual([])
  })

  it('preserves non-output files', () => {
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'keep')
    fs.writeFileSync(path.join(tmpDir, 'recording.webm'), '')

    cleanOutputDir(tmpDir)

    const remaining = fs.readdirSync(tmpDir)
    expect(remaining).toEqual(['notes.txt'])
  })

  it('is a no-op for non-existent directories', () => {
    expect(() => cleanOutputDir('/tmp/does-not-exist-xyz')).not.toThrow()
  })
})
