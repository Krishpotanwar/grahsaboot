import { describe, expect, it } from 'vitest'
import { fromMercator, fromUtm, toMercator, toUtm, utmConverter, utmEpsgFor } from './utm.ts'

describe('utm', () => {
  it('picks zones and hemispheres', () => {
    expect(utmEpsgFor(79.0882, 21.1458)).toBe(32644)
    expect(utmEpsgFor(151.21, -33.86)).toBe(32756)
    expect(utmEpsgFor(-179.9, 10)).toBe(32601)
    expect(utmEpsgFor(180, 0)).toBe(32660)
  })
  it('projects Nagpur into UTM 44N (reference values from proj4, 2026-10-05)', () => {
    const [x, y] = toUtm(32644, [79.0882, 21.1458])
    expect(x).toBeCloseTo(301475.049, 2)
    expect(y).toBeCloseTo(2339478.989, 2)
  })
  it('round-trips in both hemispheres', () => {
    for (const [epsg, p] of [
      [32644, [79.0882, 21.1458]],
      [32756, [151.21, -33.86]],
    ] as const) {
      const back = fromUtm(epsg, toUtm(epsg, [p[0], p[1]]))
      expect(back[0]).toBeCloseTo(p[0], 7)
      expect(back[1]).toBeCloseTo(p[1], 7)
    }
  })
  it('projects to and from web mercator', () => {
    const [x, y] = toMercator([79.0882, 21.1458])
    expect(x).toBeCloseTo(8804058.152, 2)
    expect(y).toBeCloseTo(2409272.195, 2)
    const [lon, lat] = fromMercator([x, y])
    expect(lon).toBeCloseTo(79.0882, 9)
    expect(lat).toBeCloseTo(21.1458, 9)
  })
  it('rejects non-UTM EPSG codes', () => {
    expect(() => utmConverter(4326)).toThrow('UNSUPPORTED_EPSG:4326')
  })
})
