import { describe, expect, it } from 'vitest'
import {
  buildNarrationAudioFilter,
  hasNarration,
  mapRealToOutput,
  normalizeNarrate,
} from '../narration'
import type { RecordingDefinition, StepTiming } from '../types'

describe('normalizeNarrate', () => {
  it('wraps a string into a spec', () => {
    expect(normalizeNarrate('hi')).toEqual({ text: 'hi' })
  })
  it('passes an object through', () => {
    expect(normalizeNarrate({ text: 'hi', voice: 'nova' })).toEqual({
      text: 'hi',
      voice: 'nova',
    })
  })
})

describe('hasNarration', () => {
  const base: RecordingDefinition = { url: 'x', steps: [{ action: 'wait' }] }

  it('false when nothing is narrated', () => {
    expect(hasNarration(base)).toBe(false)
  })
  it('true with a step narrate field', () => {
    expect(
      hasNarration({ ...base, steps: [{ action: 'wait', narrate: 'hi' }] }),
    ).toBe(true)
  })
  it('true with standalone cues', () => {
    expect(
      hasNarration({
        ...base,
        narration: { cues: [{ at: 'start', text: 'hi' }] },
      }),
    ).toBe(true)
  })
})

describe('mapRealToOutput', () => {
  it('is identity at global speed 1 with 1x steps', () => {
    const timings: StepTiming[] = [
      { stepIndex: 0, startTime: 0, endTime: 2, speed: 1 },
      { stepIndex: 1, startTime: 2, endTime: 5, speed: 1 },
    ]
    expect(mapRealToOutput(0, timings, 1)).toBeCloseTo(0)
    expect(mapRealToOutput(2, timings, 1)).toBeCloseTo(2)
    expect(mapRealToOutput(4, timings, 1)).toBeCloseTo(4)
  })

  it('compresses real time under a uniform global speed', () => {
    const timings: StepTiming[] = [
      { stepIndex: 0, startTime: 0, endTime: 4, speed: 2 },
    ]
    // real 4s at 2x → output 2s; the step start (0) maps to 0
    expect(mapRealToOutput(0, timings, 2)).toBeCloseTo(0)
    expect(mapRealToOutput(4, timings, 2)).toBeCloseTo(2)
  })

  it('maps a step start past a faster earlier step', () => {
    // step0: [0,4] @2x → output [0,2]; step1 hold: [4,10] @1x → output [2,8]
    const timings: StepTiming[] = [
      { stepIndex: 0, startTime: 0, endTime: 4, speed: 2 },
      { stepIndex: 0, startTime: 4, endTime: 10, speed: 1 },
    ]
    expect(mapRealToOutput(4, timings, 1)).toBeCloseTo(2)
    expect(mapRealToOutput(10, timings, 1)).toBeCloseTo(8)
  })
})

describe('buildNarrationAudioFilter', () => {
  it('builds a single delayed clip (no amix)', () => {
    const r = buildNarrationAudioFilter(
      [{ path: '/a.ogg', anchorSec: 1.5, durationSec: 2 }],
      1,
    )
    expect(r.inputArgs).toEqual(['-i', '/a.ogg'])
    expect(r.filters).toEqual(['[1:a]adelay=1500:all=1[narr0]'])
    expect(r.audioMapLabel).toBe('narr0')
  })

  it('mixes multiple clips with amix and offset input indices', () => {
    const r = buildNarrationAudioFilter(
      [
        { path: '/a.ogg', anchorSec: 0, durationSec: 1 },
        { path: '/b.ogg', anchorSec: 3, durationSec: 1 },
      ],
      2,
    )
    expect(r.inputArgs).toEqual(['-i', '/a.ogg', '-i', '/b.ogg'])
    expect(r.filters).toContain('[2:a]adelay=0:all=1[narr0]')
    expect(r.filters).toContain('[3:a]adelay=3000:all=1[narr1]')
    expect(r.filters).toContain(
      '[narr0][narr1]amix=inputs=2:normalize=0[narr_mix]',
    )
    expect(r.audioMapLabel).toBe('narr_mix')
  })

  it('never produces a negative delay', () => {
    const r = buildNarrationAudioFilter(
      [{ path: '/a.ogg', anchorSec: -0.001, durationSec: 1 }],
      1,
    )
    expect(r.filters[0]).toContain('adelay=0:all=1')
  })
})
