import type { LonLat } from '../evidence/types.ts'
import type { DateCandidate, S2Item } from './types.ts'

export function pointInRing([x, y]: LonLat, ring: LonLat[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const covers = (it: S2Item, pts: LonLat[]) => pts.every((p) => it.footprint.some((r) => pointInRing(p, r)))

export function selectPerDate(items: S2Item[], aoiPoints: LonLat[]): DateCandidate[] {
  const groups = new Map<string, S2Item[]>()
  for (const it of items) groups.set(it.date, [...(groups.get(it.date) ?? []), it])
  const out: DateCandidate[] = []
  for (const [date, group] of groups) {
    const sorted = [...group].sort(
      (a, b) =>
        Number(covers(b, aoiPoints)) - Number(covers(a, aoiPoints)) ||
        (a.nodataPct ?? 100) - (b.nodataPct ?? 100) ||
        (a.cloudCover ?? 100) - (b.cloudCover ?? 100) ||
        a.id.localeCompare(b.id),
    )
    out.push({
      date,
      item: sorted[0]!,
      alternates: sorted.slice(1),
      coversAoi: covers(sorted[0]!, aoiPoints),
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
