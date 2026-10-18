import { describe, expect, it } from 'vitest'
import type { AoiSummary } from '../geo/aoi.ts'
import { flow } from '../ui/copy-flow.ts'
import { ROAD_MIN_M, SITE_MIN_PX, sizeNote } from './sizeNote.ts'

const site = (areaKm2: number) =>
  ({
    kind: 'site',
    areaKm2,
    extentKm: 1,
    lengthKm: null,
    bbox: [0, 0, 1, 1],
    parts: [],
  }) as unknown as AoiSummary
const road = {
  kind: 'road',
  areaKm2: 0,
  extentKm: 3,
  lengthKm: 3,
  bbox: [0, 0, 1, 1],
  parts: [],
} as unknown as AoiSummary

describe('sizeNote for a site (a pixel is 100 m²)', () => {
  it('counts pixels from the area, in the words of the design doc', () => {
    expect(sizeNote(site(0.42), 0)).toEqual({ text: flow.outline.sizeShows('4,200'), willShow: true }) // 42 ha
    expect(sizeNote(site(0.015), 0)).toEqual({ text: flow.outline.sizeSmall('150'), willShow: false }) // 1.5 ha
  })

  it('warns below the limit and not at it', () => {
    const km2 = (px: number) => (px * 100) / 1_000_000
    expect(sizeNote(site(km2(SITE_MIN_PX - 1)), 0).willShow).toBe(false)
    expect(sizeNote(site(km2(SITE_MIN_PX)), 0).willShow).toBe(true)
  })

  it('rounds the way a person says it', () => {
    expect(sizeNote(site(0.123456), 0).text).toContain('About 1,200 pixels')
    expect(sizeNote(site(0.0123), 0).text).toContain('About 120 pixels')
    expect(sizeNote(site(0.00037), 0).text).toContain('About 4 pixels')
  })

  it('has no verdict words in what it says (the copy test scans copy-flow, this is the result)', () => {
    expect(sizeNote(site(0.01), 0).text).not.toMatch(/verified|proof|proves|confirmed/i)
  })
})

describe('sizeNote for a road (pixels across = width / 10 m)', () => {
  it('says how many pixels wide, and warns under the corridor limit', () => {
    expect(sizeNote(road, 40)).toEqual({ text: flow.outline.roadShows(40, 4), willShow: true })
    expect(sizeNote(road, 12)).toEqual({ text: flow.outline.roadNarrow(12, 1), willShow: false })
    expect(sizeNote(road, ROAD_MIN_M - 1).willShow).toBe(false)
    expect(sizeNote(road, ROAD_MIN_M).willShow).toBe(true)
  })

  it('says pixel in the singular for one', () => {
    expect(sizeNote(road, 10).text).toContain('about 1 pixel across')
    expect(sizeNote(road, 15).text).toContain('about 2 pixels across')
  })
})
