import type { LonLat } from '../evidence/types.ts'
import type { Bbox } from '../geo/aoi.ts'
import { pointInRing, selectPerDate } from '../stac/select.ts'
import type { S2Item } from '../stac/types.ts'

const GRID = 9 // a 9 x 9 grid of points over the region, edges included
const MIN_COVERAGE = 0.9
const CLEAR_SCENE_CLOUD = 20 // a scene at or under this cloud cover (%) is clear enough to stop widening
const WINDOWS = [75, 150, 240] as const
const DAY = 86_400_000

export interface ScenePick {
  item: S2Item
  ageDays: number
}
export interface Ranking {
  picks: ScenePick[]
  windowDays: (typeof WINDOWS)[number]
  widened: boolean
}

/**
 * Metadata only, no pixels: the best scene of each date that covers at least 90 % of the region, least scene cloud first,
 * then newest. Only scenes up to 75 days old count; while none of them has 20 % cloud or less the window grows to 150, then 240
 * days, and no scene older than that is ever returned. The best three come back with their age in whole days at `now`.
 */
export function rankScenes(items: S2Item[], region: Bbox, now: Date): Ranking | null {
  const [w, s, e, n] = region
  const points: LonLat[] = []
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++)
      points.push([w + ((e - w) * i) / (GRID - 1), s + ((n - s) * j) / (GRID - 1)])
  const cloud = (it: S2Item) => it.cloudCover ?? 101 // no figure sorts after every real one
  const candidates = selectPerDate(items, points)
    .map(({ item }) => ({
      item,
      coverage: points.filter((p) => item.footprint.some((r) => pointInRing(p, r))).length / points.length,
      age: (now.getTime() - Date.parse(item.datetime)) / DAY,
    }))
    .filter((c) => c.coverage >= MIN_COVERAGE)
    .sort((a, b) => cloud(a.item) - cloud(b.item) || b.item.date.localeCompare(a.item.date))
  for (const windowDays of WINDOWS) {
    const inside = candidates.filter((c) => c.age <= windowDays)
    const clearEnough = inside.some(
      (c) => c.item.cloudCover !== null && c.item.cloudCover <= CLEAR_SCENE_CLOUD,
    )
    if (clearEnough || (windowDays === 240 && inside.length))
      return {
        picks: inside.slice(0, 3).map((c) => ({ item: c.item, ageDays: Math.max(0, Math.floor(c.age)) })),
        windowDays,
        widened: windowDays !== 75,
      }
  }
  return null
}
