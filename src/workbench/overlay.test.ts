import { describe, expect, it } from 'vitest'
import { makeDisplayGrid } from '../evidence/display.ts'
import { haversineM } from '../evidence/geodesy.ts'
import type { LonLat } from '../evidence/types.ts'
import { summarizeAoi, type AoiInput } from '../geo/aoi.ts'
import { outlinePath, pointAlong } from './overlay.ts'

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

describe('pointAlong', () => {
  const near = (a: [number, number], b: [number, number]) => {
    expect(a[0]).toBeCloseTo(b[0], 1)
    expect(a[1]).toBeCloseTo(b[1], 1)
  }
  const at = (line: LonLat[], d: number) => {
    const r = summarizeAoi({ kind: 'road', geometry: { type: 'LineString', coordinates: line }, widthM: 30 })
    if (!r.ok) throw new Error('the test line must be valid')
    const g = makeDisplayGrid(r.summary.bbox, 512)
    return { g, p: pointAlong(line, g, d) }
  }

  it('walks a straight line: the middle is half way between its ends', () => {
    const line = road.geometry.coordinates
    const total = haversineM(line[0]!, line[1]!)
    const g = gridFor(road)
    const [start, end] = points(outlinePath(road, g))
    const mid: [number, number] = [(start![0]! + end![0]!) / 2, (start![1]! + end![1]!) / 2]
    near(pointAlong(line, g, total / 2), mid)
    near(pointAlong(line, g, 0), [start![0]!, start![1]!])
    near(pointAlong(line, g, total), [end![0]!, end![1]!])
  })

  it('turns the corner of a bent line by metres along it, not by the share of the vertices', () => {
    // 2 km east, then 1 km north
    const a: LonLat = [79.0, 21.1]
    const b: LonLat = [79.0 + 2 / (111.195 * Math.cos((21.1 * Math.PI) / 180)), 21.1]
    const c: LonLat = [b[0], 21.1 + 1 / 111.195]
    const line = [a, b, c]
    const d1 = haversineM(a, b)
    const d2 = haversineM(b, c)
    const { g, p } = at(line, d1 + d2 / 2) // half way up the second leg
    const [pb, pc] = [pointAlong(line, g, d1), pointAlong(line, g, d1 + d2)]
    near(p, [pb[0], (pb[1] + pc[1]) / 2])
    expect(pc[1]).toBeLessThan(pb[1]) // north is up: smaller y
    // and half way along the first leg (a third of the way along the whole line) is half way to the corner
    const pa = pointAlong(line, g, 0)
    near(pointAlong(line, g, d1 / 2), [(pa[0] + pb[0]) / 2, pa[1]])
  })

  it('stays on the line when asked for a distance past either end', () => {
    const line = road.geometry.coordinates
    const g = gridFor(road)
    near(pointAlong(line, g, -50), pointAlong(line, g, 0))
    near(pointAlong(line, g, 1e7), pointAlong(line, g, haversineM(line[0]!, line[1]!)))
  })
})
