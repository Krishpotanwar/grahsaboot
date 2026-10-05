import type { AoiGeometry, AoiPart, LonLat } from './types.ts'

const EARTH_R = 6371008.8
const RAD = Math.PI / 180

export function haversineM(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * RAD
  const dLon = (b[0] - a[0]) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function lineLengthM(line: LonLat[]): number {
  let total = 0
  for (let i = 1; i < line.length; i++) total += haversineM(line[i - 1]!, line[i]!)
  return total
}

function lerp(a: LonLat, b: LonLat, t: number): LonLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** Site = one part. Road = consecutive sub-lines of `stepM` metres (last one shorter), sharing their cut points. */
export function partsOf(aoi: AoiGeometry, stepM = 2000): AoiPart[] {
  if (aoi.kind === 'site') return [{ idx: 0, fromM: 0, toM: 0, geometry: aoi }]
  const pts = aoi.line
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + haversineM(pts[i - 1]!, pts[i]!))
  const total = cum[cum.length - 1]!
  const pointAt = (d: number): LonLat => {
    let i = 1
    while (i < pts.length - 1 && cum[i]! < d) i++
    const seg = cum[i]! - cum[i - 1]!
    return seg > 0 ? lerp(pts[i - 1]!, pts[i]!, (d - cum[i - 1]!) / seg) : pts[i]!
  }
  const parts: AoiPart[] = []
  for (let from = 0, idx = 0; from < total - 1e-6; from += stepM, idx++) {
    const to = Math.min(total, from + stepM)
    const line: LonLat[] = [from === 0 ? pts[0]! : pointAt(from)]
    for (let i = 1; i < pts.length - 1; i++) if (cum[i]! > from && cum[i]! < to) line.push(pts[i]!)
    line.push(to === total ? pts[pts.length - 1]! : pointAt(to))
    parts.push({ idx, fromM: from, toM: to, geometry: { kind: 'road', line, widthM: aoi.widthM } })
  }
  return parts
}
