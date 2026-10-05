import { describe, expect, it } from 'vitest'
import { coarsenBbox, summarizeAoi, type AoiInput } from './aoi.ts'
import type { LonLat } from '../evidence/types.ts'

const NAGPUR_SQUARE: LonLat[] = [
  [79.0832, 21.1408],
  [79.0932, 21.1408],
  [79.0932, 21.1508],
  [79.0832, 21.1508],
  [79.0832, 21.1408],
]
const ROAD: LonLat[] = [
  [79.07698, 21.138637],
  [79.095988, 21.157819],
]
const site = (ring: LonLat[]): AoiInput => ({
  kind: 'site',
  geometry: { type: 'Polygon', coordinates: [ring] },
})
const road = (line: LonLat[], widthM = 30): AoiInput => ({
  kind: 'road',
  geometry: { type: 'LineString', coordinates: line },
  widthM,
})
const codes = (r: ReturnType<typeof summarizeAoi>) => (r.ok ? [] : r.issues.map((i) => i.code))

describe('summarizeAoi', () => {
  it('accepts the Nagpur square with exact measures', () => {
    const r = summarizeAoi(site(NAGPUR_SQUARE))
    if (!r.ok) throw new Error(JSON.stringify(r.issues))
    expect(r.summary.areaKm2).toBeCloseTo(1.15023, 4)
    expect(r.summary.extentKm).toBeCloseTo(1.52051, 4)
    expect(r.summary.bbox).toEqual([79.0832, 21.1408, 79.0932, 21.1508])
    expect(r.summary.parts).toHaveLength(1)
  })
  it('rejects open, tiny, self-intersecting and out-of-range polygons', () => {
    expect(codes(summarizeAoi(site(NAGPUR_SQUARE.slice(0, 4))))).toContain('not_closed')
    expect(
      codes(
        summarizeAoi(
          site([
            [79, 21],
            [79.01, 21],
            [79, 21],
          ]),
        ),
      ),
    ).toContain('too_few_points')
    const bowtie: LonLat[] = [
      [79, 21],
      [79.01, 21.01],
      [79.01, 21],
      [79, 21.01],
      [79, 21],
    ]
    expect(codes(summarizeAoi(site(bowtie)))).toContain('self_intersects')
    expect(
      codes(
        summarizeAoi(
          site([
            [79, 95],
            [79.01, 95],
            [79.01, 95.01],
            [79, 95],
          ]),
        ),
      ),
    ).toContain('out_of_range')
  })
  it('rejects too large, too wide and too many vertices', () => {
    const big: LonLat[] = [
      [79, 21],
      [79.05, 21],
      [79.05, 21.05],
      [79, 21.05],
      [79, 21],
    ]
    expect(codes(summarizeAoi(site(big)))).toEqual(expect.arrayContaining(['too_large', 'too_wide']))
    const circle: LonLat[] = Array.from({ length: 201 }, (_, i) => {
      const a = (i / 201) * 2 * Math.PI
      return [79.0882 + 0.002 * Math.cos(a), 21.1458 + 0.002 * Math.sin(a)] as LonLat
    })
    circle.push(circle[0]!)
    expect(codes(summarizeAoi(site(circle)))).toContain('too_many_vertices')
  })
  it('accepts the 2.9 km fixture road and splits it into two parts', () => {
    const r = summarizeAoi(road(ROAD))
    if (!r.ok) throw new Error(JSON.stringify(r.issues))
    expect(r.summary.lengthKm).toBeCloseTo(2.90436, 4)
    expect(r.summary.parts.map((p) => [p.fromM, Math.round(p.toM)])).toEqual([
      [0, 2000],
      [2000, 2904],
    ])
    expect(r.summary.bbox[0]).toBeLessThan(79.07698)
  })
  it('rejects bad road lengths and widths', () => {
    expect(
      codes(
        summarizeAoi(
          road([
            [79, 21],
            [79, 21.0005],
          ]),
        ),
      ),
    ).toContain('too_short')
    expect(
      codes(
        summarizeAoi(
          road([
            [79, 21],
            [79, 21.11],
          ]),
        ),
      ),
    ).toContain('too_long')
    expect(codes(summarizeAoi(road(ROAD, 4)))).toContain('bad_width')
    expect(codes(summarizeAoi(road(ROAD, 30.5)))).toContain('bad_width')
  })
  it('accepts a southern-hemisphere site', () => {
    const syd: LonLat[] = [
      [151.2, -33.87],
      [151.21, -33.87],
      [151.21, -33.86],
      [151.2, -33.86],
      [151.2, -33.87],
    ]
    const r = summarizeAoi(site(syd))
    expect(r.ok && r.summary.areaKm2).toBeGreaterThan(1)
  })
  it('rejects a site that crosses the antimeridian but accepts one beside it', () => {
    const fiji: LonLat[] = [
      [179.995, -16.8],
      [-179.995, -16.8],
      [-179.995, -16.79],
      [179.995, -16.79],
      [179.995, -16.8],
    ]
    expect(codes(summarizeAoi(site(fiji)))).toEqual(['out_of_range'])
    const east: LonLat[] = [
      [179.99, -16.8],
      [179.999, -16.8],
      [179.999, -16.79],
      [179.99, -16.79],
      [179.99, -16.8],
    ]
    expect(summarizeAoi(site(east)).ok).toBe(true)
  })
  it('rejects a road that crosses the antimeridian but accepts one beside it', () => {
    expect(
      codes(
        summarizeAoi(
          road([
            [179.99, -16.8],
            [-179.99, -16.8],
          ]),
        ),
      ),
    ).toEqual(['out_of_range'])
    expect(
      summarizeAoi(
        road([
          [179.97, -16.8],
          [179.99, -16.8],
        ]),
      ).ok,
    ).toBe(true)
  })
  it('rejects polygons with holes and polygons without an outer ring', () => {
    const hole: LonLat[] = [
      [79.085, 21.142],
      [79.087, 21.142],
      [79.087, 21.144],
      [79.085, 21.144],
      [79.085, 21.142],
    ]
    const polygon = (coordinates: LonLat[][]): AoiInput => ({
      kind: 'site',
      geometry: { type: 'Polygon', coordinates },
    })
    expect(codes(summarizeAoi(polygon([NAGPUR_SQUARE, hole])))).toEqual(['out_of_range'])
    expect(codes(summarizeAoi(polygon([])))).toEqual(['out_of_range'])
  })
  it('rejects collinear and single-point rings as too_small', () => {
    const collinear: LonLat[] = [
      [79, 21],
      [79.01, 21],
      [79.02, 21],
      [79, 21],
    ]
    const point: LonLat[] = [
      [79, 21],
      [79, 21],
      [79, 21],
      [79, 21],
    ]
    for (const ring of [collinear, point]) {
      const r = summarizeAoi(site(ring))
      expect(r.ok).toBe(false)
      expect(codes(r)).toContain('too_small')
    }
  })
})

describe('coarsenBbox', () => {
  it('snaps outward to 0.1 degrees for privacy', () => {
    expect(coarsenBbox([79.0832, 21.1408, 79.0932, 21.1508])).toEqual([79, 21.1, 79.1, 21.2])
    expect(coarsenBbox([-0.05, -0.05, 0.05, 0.05])).toEqual([-0.1, -0.1, 0.1, 0.1])
  })
})
