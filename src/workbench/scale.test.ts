import { describe, expect, it } from 'vitest'
import { makeDisplayGrid } from '../evidence/display.ts'
import { groundWidthM, scaleBar } from './scale.ts'

/** A grid `km` kilometres of ground wide (padding excluded) centred on `lat`: the outline is as wide as that, plus the 10% pad each side. */
function gridOf(km: number, lat = 21): ReturnType<typeof makeDisplayGrid> {
  const dLon = km / 2 / (111.32 * Math.cos((lat * Math.PI) / 180))
  return makeDisplayGrid([79 - dLon, lat - 0.002, 79 + dLon, lat + 0.002], 512)
}

describe('groundWidthM', () => {
  it('is ground metres, not mercator metres: the same box is narrower the nearer the pole', () => {
    const at = (lat: number) => {
      const g = makeDisplayGrid([79, lat, 79.01, lat + 0.01], 512)
      return { ground: groundWidthM(g), mercator: g.maxX - g.minX }
    }
    const equator = at(0)
    const north = at(60)
    expect(equator.ground).toBeCloseTo(equator.mercator, 0)
    expect(north.ground / north.mercator).toBeCloseTo(0.5, 2) // cos 60 degrees
    // 0.01 degrees of longitude at 60 N is about 556 m of ground, plus 10% each side
    expect(north.ground).toBeGreaterThan(600)
    expect(north.ground).toBeLessThan(700)
  })
})

describe('scaleBar', () => {
  it('takes the longest nice length that fits in a quarter of the photo', () => {
    // 1 km outline + 10% each side = 1.2 km photo: a quarter is 300 m
    expect(scaleBar(gridOf(1)).m).toBe(200)
    // 3 km -> 3.6 km photo: a quarter is 900 m
    expect(scaleBar(gridOf(3)).m).toBe(500)
    // 8 km -> 9.6 km photo: a quarter is 2.4 km
    expect(scaleBar(gridOf(8)).m).toBe(2000)
  })

  it('says how much of the photo the bar fills', () => {
    const g = gridOf(1)
    const { m, share } = scaleBar(g)
    expect(share).toBeCloseTo(m / groundWidthM(g), 9)
    expect(share).toBeGreaterThan(0.1)
    expect(share).toBeLessThanOrEqual(0.25)
  })

  it('keeps every photo between 200 m and 40 km wide within 10-25 % of its width', () => {
    for (let km = 0.3; km < 40; km *= 1.07) {
      const { share } = scaleBar(gridOf(km / 1.2))
      expect(share, `${km} km`).toBeGreaterThan(0.1)
      expect(share, `${km} km`).toBeLessThanOrEqual(0.25 + 1e-9)
    }
  })

  it('stops at the ends of the list: 50 m for a tiny photo, 10 km for a huge one', () => {
    const tiny = makeDisplayGrid([79, 21, 79.00001, 21.00001], 512) // the 100 m minimum pad each side: 200 m of ground
    expect(scaleBar(tiny).m).toBe(50)
    expect(scaleBar(gridOf(80)).m).toBe(10000)
  })
})
