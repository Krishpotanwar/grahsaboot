import { describe, expect, it } from 'vitest'
import { makeDisplayGrid } from '../evidence/display.ts'
import type { LonLat } from '../evidence/types.ts'
import { summarizeAoi, type AoiInput } from '../geo/aoi.ts'
import { outlinePath } from './overlay.ts'

const points = (d: string) =>
  [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])])

// The Nagpur ±0.005° square used across the tests.
const RING: LonLat[] = [
  [79.0832, 21.1408],
  [79.0932, 21.1408],
  [79.0932, 21.1508],
  [79.0832, 21.1508],
  [79.0832, 21.1408],
]
const site: AoiInput = { kind: 'site', geometry: { type: 'Polygon', coordinates: [RING] } }
const road: AoiInput = {
  kind: 'road',
  geometry: {
    type: 'LineString',
    coordinates: [
      [79.07698, 21.138637],
      [79.095988, 21.157819],
    ],
  },
  widthM: 30,
}

function gridFor(aoi: AoiInput) {
  const r = summarizeAoi(aoi)
  if (!r.ok) throw new Error('the test outline must be valid')
  return makeDisplayGrid(r.summary.bbox, 512)
}

describe('outlinePath', () => {
  it('draws a site as a closed ring: N+1 points, first equals last, all inside the grid', () => {
    const g = gridFor(site)
    const d = outlinePath(site, g)
    const p = points(d)
    expect(p).toHaveLength(RING.length)
    expect(p[0]).toEqual(p[p.length - 1])
    for (const [x, y] of p) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(g.width)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(g.height)
    }
    expect(d.endsWith('Z')).toBe(true)
  })

  it('has north up and west left, with the same margin on both sides', () => {
    const g = gridFor(site)
    const p = points(outlinePath(site, g)) // south-west, south-east, north-east, north-west
    expect(p[0][0]).toBeLessThan(p[1][0]) // west of east
    expect(p[0][1]).toBeGreaterThan(p[3][1]) // south below north (pixel y grows downward)
    expect(Math.abs(p[0][0] - (g.width - p[1][0]))).toBeLessThan(1)
    expect(Math.abs(p[3][1] - (g.height - p[0][1]))).toBeLessThan(1)
  })

  it('draws a road as its centre line, open, inside the grid', () => {
    const g = gridFor(road)
    const d = outlinePath(road, g)
    const p = points(d)
    expect(p).toHaveLength(2)
    expect(d.endsWith('Z')).toBe(false)
    for (const [x, y] of p) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(g.width)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(g.height)
    }
  })
})
