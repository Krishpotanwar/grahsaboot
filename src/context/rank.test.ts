import { describe, expect, it } from 'vitest'
import { fixtureItem } from '../../tests/fixtures/scene.ts'
import type { LonLat } from '../evidence/types.ts'
import type { Bbox } from '../geo/aoi.ts'
import { parseItem } from '../stac/parse.ts'
import type { S2Item } from '../stac/types.ts'
import { rankScenes } from './rank.ts'

const NOW = new Date('2026-10-18T12:00:00Z')
const DAY = 86_400_000
const REGION: Bbox = [79.08, 21.14, 79.1, 21.16]
const at = (u: number, v: number): LonLat => [
  REGION[0] + u * (REGION[2] - REGION[0]),
  REGION[1] + v * (REGION[3] - REGION[1]),
]
/** A footprint given in region units: (0,0) is the south-west corner of the region, (1,1) the north-east one. */
const ring = (...uv: Array<[number, number]>): LonLat[][] => {
  const pts = uv.map(([u, v]) => at(u, v))
  return [[...pts, pts[0]!]]
}
const COVERS = ring([-5, -5], [6, -5], [6, 6], [-5, 6])
const CUT_CORNER = ring([-1, -1], [2, -1], [2, -0.3], [-0.3, 2], [-1, 2]) // loses 6 of the 81 grid points
const MISSING_COLUMN = ring([-1, -1], [0.99, -1], [0.99, 2], [-1, 2]) // loses 9 of the 81 grid points
const HALF = ring([-1, -1], [0.5, -1], [0.5, 2], [-1, 2])

// One parsed fixture scene is the template: the tests change only what ranking reads.
const TEMPLATE = parseItem(
  fixtureItem('https://sentinel-cogs.s3.us-west-2.amazonaws.com', {
    date: '2025-01-10',
    scl: () => 5,
    roof: false,
    cloud: 0,
  }),
  'sentinel-2-l2a',
)!
const item = (id: string, daysAgo: number, cloudCover: number | null, footprint = COVERS): S2Item => {
  const datetime = new Date(NOW.getTime() - daysAgo * DAY).toISOString()
  return { ...TEMPLATE, id, datetime, date: datetime.slice(0, 10), cloudCover, footprint }
}
const ids = (r: ReturnType<typeof rankScenes>) => r?.picks.map((p) => p.item.id)

describe('rankScenes order', () => {
  it('puts the least cloud first, then the newest', () => {
    const r = rankScenes(
      [item('b', 20, 10), item('c', 10, 10), item('a', 30, 5), item('d', 5, 30)],
      REGION,
      NOW,
    )
    expect(ids(r)).toEqual(['a', 'c', 'b']) // d is fourth: only three are picked
  })

  it('sorts a scene without a cloud figure last', () => {
    const r = rankScenes([item('n', 5, null), item('x', 30, 90)], REGION, NOW)
    expect(ids(r)).toEqual(['x', 'n'])
  })

  it('puts coverage before cloud: a scene that misses the region is not a candidate however clear it is', () => {
    const r = rankScenes([item('half', 5, 0, HALF), item('full', 30, 40)], REGION, NOW)
    expect(ids(r)).toEqual(['full'])
  })

  it('keeps a scene covering at least 90 % of the region and drops one covering less', () => {
    expect(ids(rankScenes([item('cut', 5, 0, CUT_CORNER)], REGION, NOW))).toEqual(['cut']) // 75 of 81 points
    expect(rankScenes([item('col', 5, 0, MISSING_COLUMN)], REGION, NOW)).toBeNull() // 72 of 81 points
  })

  it('takes the best scene of each date (the one covering the region) and returns the date once', () => {
    const r = rankScenes([item('full', 20, 40), item('part', 20.01, 0, HALF)], REGION, NOW)
    expect(ids(r)).toEqual(['full'])
    const two = rankScenes([item('x1', 20, 30), item('x2', 20.01, 10)], REGION, NOW)
    expect(ids(two)).toEqual(['x2'])
  })

  it('picks the best three', () => {
    const r = rankScenes(
      [1, 2, 3, 4, 5].map((n) => item(`s${n}`, n * 5, n)),
      REGION,
      NOW,
    )
    expect(ids(r)).toEqual(['s1', 's2', 's3'])
  })

  it('is stable: any input order gives the same picks', () => {
    const base = [item('a', 10, 10), item('b', 20, 10), item('c', 30, 10), item('d', 5, null)]
    const perms = (xs: S2Item[]): S2Item[][] =>
      xs.length < 2
        ? [xs]
        : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]))
    for (const p of perms(base)) expect(ids(rankScenes(p, REGION, NOW))).toEqual(['a', 'b', 'c'])
  })
})

describe('rankScenes window', () => {
  it('stays at 75 days while a scene in it has 20 % cloud or less', () => {
    const r = rankScenes([item('a', 30, 20), item('b', 100, 0)], REGION, NOW)
    expect(r).toMatchObject({ windowDays: 75, widened: false })
    expect(ids(r)).toEqual(['a'])
  })

  it('widens to 150 days when nothing in 75 is clear enough', () => {
    const r = rankScenes([item('a', 30, 20.1), item('b', 100, 5)], REGION, NOW)
    expect(r).toMatchObject({ windowDays: 150, widened: true })
    expect(ids(r)).toEqual(['b', 'a'])
  })

  it('widens to 240 days when 150 is not enough either, and never further', () => {
    const r = rankScenes(
      [item('a', 30, 50), item('b', 100, 40), item('c', 200, 5), item('old', 241, 0)],
      REGION,
      NOW,
    )
    expect(r).toMatchObject({ windowDays: 240, widened: true })
    expect(ids(r)).toEqual(['c', 'b', 'a'])
  })

  it('does not count a missing cloud figure as clear', () => {
    const r = rankScenes([item('n', 30, null), item('b', 100, 5)], REGION, NOW)
    expect(r).toMatchObject({ windowDays: 150, widened: true })
    expect(ids(r)).toEqual(['b', 'n'])
  })

  it('treats the day counts as inclusive', () => {
    expect(rankScenes([item('e', 75, 10)], REGION, NOW)).toMatchObject({ windowDays: 75, widened: false })
    expect(rankScenes([item('e', 75.5, 10)], REGION, NOW)).toMatchObject({ windowDays: 150, widened: true })
    expect(rankScenes([item('e', 240, 10)], REGION, NOW)).toMatchObject({ windowDays: 240, widened: true })
  })

  it('never returns a scene older than 240 days', () => {
    expect(rankScenes([item('old', 241, 0)], REGION, NOW)).toBeNull()
    const r = rankScenes([item('old', 241, 0), item('x', 30, 90)], REGION, NOW)
    expect(ids(r)).toEqual(['x'])
    expect(r?.windowDays).toBe(240)
  })

  it('still returns cloudy scenes from the last window rather than nothing', () => {
    expect(ids(rankScenes([item('a', 200, 95)], REGION, NOW))).toEqual(['a'])
  })

  it('is null when nothing qualifies', () => {
    expect(rankScenes([], REGION, NOW)).toBeNull()
    expect(rankScenes([item('half', 5, 0, HALF)], REGION, NOW)).toBeNull()
  })
})

describe('rankScenes ages', () => {
  it('gives the age in whole days at now', () => {
    const r = rankScenes([item('a', 10.5, 1), item('b', 20, 2), item('c', 0.2, 3)], REGION, NOW)
    expect(r?.picks.map((p) => p.ageDays)).toEqual([10, 20, 0])
  })

  it('does not report a negative age for a scene dated after now', () => {
    expect(rankScenes([item('f', -1, 1)], REGION, NOW)?.picks[0]?.ageDays).toBe(0)
  })
})
