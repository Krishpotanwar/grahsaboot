import { describe, expect, it } from 'vitest'
import { isClearClass, labelFor, sclStats } from './scl.ts'

const grid = (w: number, h: number, f: (x: number, y: number) => number) =>
  Uint8Array.from({ length: w * h }, (_, i) => f(i % w, Math.floor(i / w)))
const all = (w: number, h: number, sub: number) => new Uint8Array(w * sub * h * sub).fill(1)

describe('labelFor', () => {
  it.each([
    [0.95, 0, 10, 'CLEAR'],
    [0.9499, 0, 10, 'PARTIAL'],
    [0.05, 0, 10, 'OBSCURED'],
    [0.5, 0.5, 10, 'NOT_COVERED'],
    [1, 0, 0, 'NOT_COVERED'],
  ] as const)('clear=%s nodata=%s total=%s → %s', (c, n, t, label) => {
    expect(labelFor(c, n, t)).toBe(label)
  })
})

describe('isClearClass', () => {
  it('is true for ground the eye can see: 2, 4, 5, 6, 7', () => {
    expect([...Array(12).keys()].filter(isClearClass)).toEqual([2, 4, 5, 6, 7])
  })
})

describe('sclStats', () => {
  it('counts classes per sub-cell and labels a clear scene', () => {
    const s = sclStats(
      grid(4, 4, () => 5),
      4,
      4,
      all(4, 4, 2),
      2,
    )
    expect(s.total).toBe(64)
    expect(s.counts[5]).toBe(64)
    expect(s.clearFraction).toBe(1)
    expect(s.label).toBe('CLEAR')
    expect(s.policy).toBe('scl-v2')
  })
  it('splits half cloud into PARTIAL', () => {
    const s = sclStats(
      grid(10, 4, (x) => (x >= 5 ? 9 : 4)),
      10,
      4,
      all(10, 4, 1),
      1,
    )
    expect(s.clearFraction).toBeCloseTo(0.5, 6)
    expect(s.obstructedFraction).toBeCloseTo(0.5, 6)
    expect(s.label).toBe('PARTIAL')
  })
  it('counts unclassified and dark ground as clear view (older baselines label clear construction ground 7)', () => {
    // Real case: Navi Mumbai, 22 Feb 2018, baseline 00.01 — 63% class 7 and 14% class 2 on a cloud-free photo.
    const s = sclStats(
      grid(4, 4, (x) => (x === 0 ? 2 : 7)),
      4,
      4,
      all(4, 4, 1),
      1,
    )
    expect(s.validFraction).toBe(0)
    expect(s.uncertainFraction).toBe(1)
    expect(s.clearFraction).toBe(1)
    expect(s.label).toBe('CLEAR')
  })
  it('treats cloud shadow and cirrus as obstruction', () => {
    const s = sclStats(
      grid(4, 4, (x) => (x < 2 ? 3 : 10)),
      4,
      4,
      all(4, 4, 1),
      1,
    )
    expect(s.obstructedFraction).toBe(1)
    expect(s.label).toBe('OBSCURED')
  })
  it('counts the outside-scene area as no-data', () => {
    const s = sclStats(
      grid(4, 4, (x) => (x === 0 ? 7 : 4)),
      4,
      4,
      all(4, 4, 1),
      1,
      16,
    )
    expect(s.uncertainFraction).toBeCloseTo(4 / 32, 6)
    expect(s.clearFraction).toBeCloseTo(0.5, 6)
    expect(s.nodataFraction).toBeCloseTo(0.5, 6)
    expect(s.label).toBe('NOT_COVERED')
  })
  it('ignores cells outside the mask', () => {
    const mask = new Uint8Array(16)
    mask[0] = 1
    expect(
      sclStats(
        grid(4, 4, () => 9),
        4,
        4,
        mask,
        1,
      ).total,
    ).toBe(1)
  })
})
