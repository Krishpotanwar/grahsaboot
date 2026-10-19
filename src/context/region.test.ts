import { describe, expect, it } from 'vitest'
import { makeDisplayGrid } from '../evidence/display.ts'
import { haversineM } from '../evidence/geodesy.ts'
import type { DisplayGrid } from '../evidence/types.ts'
import type { Bbox } from '../geo/aoi.ts'
import { gridFor, levelFor, regionFits, regionFor, viewTooWide } from './region.ts'

const NAGPUR: [number, number] = [79.0882, 21.1458]
/** A box `wKm` x `hKm` around a centre, built with a flat-earth step (the tests measure it back with haversine). */
const around = ([lon, lat]: [number, number], wKm: number, hKm: number): Bbox => {
  const dLat = hKm / 2 / 111.195
  const dLon = wKm / 2 / (111.195 * Math.cos((lat * Math.PI) / 180))
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat]
}
const km = ([w, s, e, n]: Bbox): [number, number] => {
  const [cx, cy] = [(w + e) / 2, (s + n) / 2]
  return [haversineM([w, cy], [e, cy]) / 1000, haversineM([cx, s], [cx, n]) / 1000]
}
const longSide = (g: DisplayGrid) => Math.max(g.width, g.height)

describe('regionFor', () => {
  it('cuts a wide view to 12 km a side and says so', () => {
    const r = regionFor(around(NAGPUR, 40, 30))
    const [w, h] = km(r.bbox)
    expect(r.clamped).toBe(true)
    expect(w).toBeCloseTo(12, 2)
    expect(h).toBeCloseTo(12, 2)
    expect(w).toBeLessThanOrEqual(12 + 1e-6)
  })

  it('cuts around the centre of the view', () => {
    const view = around(NAGPUR, 40, 30)
    const [w, s, e, n] = regionFor(view).bbox
    expect((w + e) / 2).toBeCloseTo((view[0] + view[2]) / 2, 9)
    expect((s + n) / 2).toBeCloseTo((view[1] + view[3]) / 2, 9)
  })

  it('leaves a view of 12 km or less as it is', () => {
    const view = around(NAGPUR, 11.9, 8)
    expect(regionFor(view)).toEqual({ bbox: view, clamped: false })
  })

  it('cuts only the side that is too long', () => {
    const view = around(NAGPUR, 5, 30)
    const r = regionFor(view)
    expect(r.clamped).toBe(true)
    expect([r.bbox[0], r.bbox[2]]).toEqual([view[0], view[2]])
    expect(km(r.bbox)[1]).toBeCloseTo(12, 2)
  })

  it('counts kilometres at the latitude of the view', () => {
    const span = ([w, , e]: Bbox) => e - w
    const equator = regionFor([-1, -1, 1, 1]).bbox
    const sixty = regionFor([-1, 59, 1, 61]).bbox
    expect(span(sixty) / span(equator)).toBeCloseTo(2, 3) // cos 60 degrees = 0.5
    expect(km(sixty)[0]).toBeCloseTo(12, 1)
  })

  it('takes another limit', () => {
    const r = regionFor(around(NAGPUR, 40, 30), 6)
    expect(km(r.bbox)[0]).toBeCloseTo(6, 2)
    expect(r.clamped).toBe(true)
  })
})

describe('gridFor', () => {
  it('gives about two display pixels per 10 m pixel, with no padding fraction', () => {
    const r = around(NAGPUR, 4, 4)
    expect(gridFor(r)).toEqual(makeDisplayGrid(r, 800, 0))
  })

  it('follows the long side of the region', () => {
    expect(longSide(gridFor(around(NAGPUR, 5, 2)))).toBe(1000)
    expect(longSide(gridFor(around(NAGPUR, 2, 5)))).toBe(1000)
  })

  it('never goes below 64 pixels', () => {
    expect(longSide(gridFor(around(NAGPUR, 0.3, 0.3)))).toBe(64)
  })

  it('never goes above 1024 pixels, or above the maxSide it is given', () => {
    expect(longSide(gridFor(around(NAGPUR, 12, 12)))).toBe(1024)
    expect(longSide(gridFor(around(NAGPUR, 6, 6)))).toBe(1024) // 2 x 6000 / 10 = 1200, capped
    expect(longSide(gridFor(around(NAGPUR, 12, 12), 512))).toBe(512)
    expect(longSide(gridFor(around(NAGPUR, 400, 400)))).toBe(1024)
  })
})

describe('levelFor', () => {
  it('reads the finer level up to 10 km on the long side and the coarser one beyond', () => {
    expect(levelFor(around(NAGPUR, 4, 4))).toBe(0)
    expect(levelFor(around(NAGPUR, 9.9, 9.9))).toBe(0)
    expect(levelFor(around(NAGPUR, 10.1, 3))).toBe(1)
    expect(levelFor(around(NAGPUR, 3, 10.1))).toBe(1)
    expect(levelFor(around(NAGPUR, 12, 12))).toBe(1)
  })
})

describe('regionFits', () => {
  it('accepts up to 12 km on a side and refuses more', () => {
    expect(regionFits(regionFor([78.9, 21.0, 79.3, 21.4]).bbox)).toBe(true) // clamped to 12 km
    expect(regionFits([78.9, 21.0, 79.3, 21.4])).toBe(false) // about 41 km wide
    expect(regionFits([79.0, 21.1, 79.05, 21.15])).toBe(true)
  })
})

describe('viewTooWide', () => {
  it('is false up to 12 km on either side and true beyond', () => {
    expect(viewTooWide(around(NAGPUR, 11, 5))).toBe(false)
    expect(viewTooWide(around(NAGPUR, 5, 11))).toBe(false)
    expect(viewTooWide(around(NAGPUR, 13, 5))).toBe(true)
    expect(viewTooWide(around(NAGPUR, 5, 13))).toBe(true)
    expect(viewTooWide(around(NAGPUR, 40, 30))).toBe(true)
  })

  it('counts kilometres at the latitude of the view, like regionFor', () => {
    // 0.2 degrees of longitude: 22 km at the equator, 11 km at 60 degrees north
    expect(viewTooWide([0, -0.05, 0.2, 0.05])).toBe(true)
    expect(viewTooWide([0, 59.95, 0.2, 60.05])).toBe(false)
  })

  it('takes another limit', () => {
    expect(viewTooWide(around(NAGPUR, 5, 5), 4)).toBe(true)
    expect(viewTooWide(around(NAGPUR, 3, 3), 4)).toBe(false)
  })

  it('says yes to a view it cannot measure, never a silent no', () => {
    expect(viewTooWide([Number.NaN, 21, 79, 22])).toBe(true)
    expect(viewTooWide([78, 21, Number.POSITIVE_INFINITY, 22])).toBe(true)
  })

  it('agrees with regionFor on whether the view had to be cut', () => {
    for (const [w, h] of [
      [3, 3],
      [11.9, 2],
      [12.1, 2],
      [2, 12.1],
      [30, 30],
    ] as const)
      expect(viewTooWide(around(NAGPUR, w, h)), `${w} x ${h}`).toBe(regionFor(around(NAGPUR, w, h)).clamped)
  })
})
