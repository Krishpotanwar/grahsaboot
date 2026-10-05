import { describe, expect, it } from 'vitest'
import { countMask, rasterizeAoi } from './mask.ts'
import { levelFromTransform } from './frame.ts'
import type { LonLat } from './types.ts'

const LVL10 = levelFromTransform([10, 0, 300000, 0, -10, 2341000], [256, 256], 0, 256, 256)
const SQUARE: LonLat[] = [
  [79.0832, 21.1408],
  [79.0932, 21.1408],
  [79.0932, 21.1508],
  [79.0832, 21.1508],
  [79.0832, 21.1408],
]

describe('rasterizeAoi', () => {
  it('fills the Nagpur square with area within 1 %', () => {
    const mask = rasterizeAoi({ kind: 'site', rings: [SQUARE] }, 32644, [0, 0, 256, 256], LVL10, 1)
    const km2 = (countMask(mask) * 100) / 1e6
    expect(km2).toBeGreaterThan(1.15023 * 0.99)
    expect(km2).toBeLessThan(1.15023 * 1.01)
  })
  it('leaves holes empty (even-odd)', () => {
    const hole: LonLat[] = [
      [79.0857, 21.1433],
      [79.0907, 21.1433],
      [79.0907, 21.1483],
      [79.0857, 21.1483],
      [79.0857, 21.1433],
    ]
    const solid = countMask(rasterizeAoi({ kind: 'site', rings: [SQUARE] }, 32644, [0, 0, 256, 256], LVL10))
    const holed = countMask(
      rasterizeAoi({ kind: 'site', rings: [SQUARE, hole] }, 32644, [0, 0, 256, 256], LVL10),
    )
    expect(solid - holed).toBeGreaterThan(2500)
  })
  it('fills a 1 km x 30 m corridor with flat caps', () => {
    // straight east-west line in UTM 44N, 1 km long, inside the fixture extent
    const line: LonLat[] = [
      [79.08, 21.145],
      [79.08965, 21.145],
    ]
    const n = countMask(rasterizeAoi({ kind: 'road', line, widthM: 30 }, 32644, [0, 0, 256, 256], LVL10, 2))
    expect(n * 25).toBeGreaterThan(1000 * 30 * 0.93) // sub=2 → 5 m cells → 25 m² each
    expect(n * 25).toBeLessThan(1000 * 30 * 1.07)
  })
  it('respects sub-sampling (4x cells at sub=2)', () => {
    const a = countMask(rasterizeAoi({ kind: 'site', rings: [SQUARE] }, 32644, [0, 0, 256, 256], LVL10, 1))
    const b = countMask(rasterizeAoi({ kind: 'site', rings: [SQUARE] }, 32644, [0, 0, 256, 256], LVL10, 2))
    expect(b / a).toBeGreaterThan(3.9)
    expect(b / a).toBeLessThan(4.1)
  })
})
