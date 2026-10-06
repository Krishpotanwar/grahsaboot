import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { groundTrack, nextPasses, staleEpoch, subPoint, swathRing, toSatrec, type Omm } from './orbit.ts'
import { SATELLITES } from './catalog.ts'

const OMM = JSON.parse(
  readFileSync(new URL('../../tests/fixtures/tle.json', import.meta.url), 'utf8'),
) as Omm[]
const rec = (norad: number) => toSatrec(OMM.find((o) => Number(o.NORAD_CAT_ID) === norad)!)
const NAGPUR: [number, number] = [79.0882, 21.1458]

describe('orbit maths (vectors computed in planning, 2026-10-05)', () => {
  it('places Sentinel-2C at its sub-satellite point', () => {
    const p = subPoint(rec(60989), new Date('2026-10-05T05:30:00Z'))!
    expect(p.lat).toBeCloseTo(-67.09, 1)
    expect(p.lon).toBeCloseTo(-84.207, 1)
    expect(p.heightKm).toBeGreaterThan(810)
    expect(p.heightKm).toBeLessThan(820)
  })
  it('builds a continuous ±45 min track (no antimeridian jumps)', () => {
    const t = groundTrack(rec(42063), new Date('2026-10-05T05:30:00Z'))
    expect(t).toHaveLength(181)
    for (let i = 1; i < t.length; i++) expect(Math.abs(t[i]![0] - t[i - 1]![0])).toBeLessThan(30)
  })
  it('closes the swath ring around the track', () => {
    const t = groundTrack(rec(42063), new Date('2026-10-05T05:30:00Z'))
    const ring = swathRing(t, 145)
    expect(ring).toHaveLength(t.length * 2 + 1)
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })
  it('finds the next daylight descending passes over Nagpur', () => {
    const from = new Date('2026-10-05T00:00:00Z')
    const s2b = nextPasses(rec(42063), NAGPUR, 145, from)
    expect(s2b[0]!.time.getTime()).toBeGreaterThan(Date.parse('2026-10-09T05:21:00Z'))
    expect(s2b[0]!.time.getTime()).toBeLessThan(Date.parse('2026-10-09T05:26:00Z'))
    expect(s2b[0]!.distanceKm).toBeGreaterThan(90)
    expect(s2b[0]!.distanceKm).toBeLessThan(120)
    const s2c = nextPasses(rec(60989), NAGPUR, 145, from)
    expect(s2c[0]!.time.toISOString().slice(0, 13)).toBe('2026-10-14T05')
    // 60 s samples sit ~420 km apart along the track; these two passes are missed unless the closest approach is refined.
    expect(nextPasses(rec(40697), NAGPUR, 145, from)[0]!.time.toISOString().slice(0, 16)).toBe('2026-10-06T05:23')
    const l8 = nextPasses(rec(39084), NAGPUR, 92.5, from)[0]!
    expect(l8.time.toISOString().slice(0, 16)).toBe('2026-10-10T05:08')
    expect(l8.distanceKm).toBeLessThan(10)
  })
  it('knows every catalogued satellite', () => {
    expect(SATELLITES.map((s) => s.norad).sort()).toEqual(OMM.map((o) => Number(o.NORAD_CAT_ID)).sort())
  })
})

describe('staleEpoch (when LIVE gives way to "Orbits from ...")', () => {
  const DAY = 86_400_000
  const newest = Date.parse('2026-10-04T22:26:18.504960Z')
  it('reads CelesTrak epochs as UTC and takes the newest', () => {
    const got = staleEpoch(OMM, newest + 4 * DAY)
    expect(got).toBe(newest)
  })
  it('stays null up to exactly 3 days, then reports the epoch', () => {
    expect(staleEpoch(OMM, newest + 3 * DAY)).toBeNull()
    expect(staleEpoch(OMM, newest + 3 * DAY + 1)).toBe(newest)
  })
  it('lets one fresh satellite keep the badge live', () => {
    const mixed = [{ EPOCH: '2026-09-01T00:00:00.000000' }, { EPOCH: '2026-10-04T00:00:00.000000' }]
    expect(staleEpoch(mixed, Date.parse('2026-10-06T00:00:00Z'))).toBeNull()
    expect(staleEpoch(mixed, Date.parse('2026-10-08T00:00:00Z'))).toBe(Date.parse('2026-10-04T00:00:00Z'))
  })
  it('says nothing when no epoch can be read', () => {
    const now = Date.parse('2030-01-01T00:00:00Z')
    expect(staleEpoch([], now)).toBeNull()
    expect(staleEpoch([{}, { EPOCH: 'garbage' }], now)).toBeNull()
  })
})
