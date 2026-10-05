import { LIMITS } from './limits.ts'
import { haversineM, lineLengthM, partsOf } from '../evidence/geodesy.ts'
import { toUtm, utmEpsgFor } from '../evidence/utm.ts'
import type { AoiGeometry, AoiPart, LonLat, XY } from '../evidence/types.ts'

export type Bbox = [number, number, number, number]
export type AoiInput =
  | { kind: 'site'; geometry: { type: 'Polygon'; coordinates: LonLat[][] } }
  | { kind: 'road'; geometry: { type: 'LineString'; coordinates: LonLat[] }; widthM: number }
export interface AoiSummary {
  kind: 'site' | 'road'
  areaKm2: number
  extentKm: number
  lengthKm: number | null
  bbox: Bbox
  parts: AoiPart[]
}
export type IssueCode =
  | 'not_closed'
  | 'too_few_points'
  | 'too_many_vertices'
  | 'self_intersects'
  | 'too_large'
  | 'too_small'
  | 'too_wide'
  | 'too_short'
  | 'too_long'
  | 'bad_width'
  | 'out_of_range'
export interface Issue {
  code: IssueCode
  value?: number
  limit?: number
}
export type AoiResult = { ok: true; summary: AoiSummary } | { ok: false; issues: Issue[] }

export function toAoiGeometry(input: AoiInput): AoiGeometry {
  return input.kind === 'site'
    ? { kind: 'site', rings: input.geometry.coordinates }
    : { kind: 'road', line: input.geometry.coordinates, widthM: input.widthM }
}

export function bboxOf(points: LonLat[]): Bbox {
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity
  for (const [x, y] of points) {
    w = Math.min(w, x)
    e = Math.max(e, x)
    s = Math.min(s, y)
    n = Math.max(n, y)
  }
  return [w, s, e, n]
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6
export function coarsenBbox(b: Bbox, step = 0.1): Bbox {
  return [
    round6(Math.max(-180, Math.floor(round6(b[0] / step)) * step)),
    round6(Math.max(-90, Math.floor(round6(b[1] / step)) * step)),
    round6(Math.min(180, Math.ceil(round6(b[2] / step)) * step)),
    round6(Math.min(90, Math.ceil(round6(b[3] / step)) * step)),
  ]
}

const inRange = ([lon, lat]: LonLat) =>
  Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90

// Vertices more than 180° of longitude apart wrap round the globe, so UTM, area and bbox would be wrong.
const crossesAntimeridian = (pts: LonLat[]) =>
  pts.some((p, i) => i > 0 && Math.abs(p[0] - pts[i - 1]![0]) > 180)

function maxPairwiseKm(points: LonLat[]): number {
  let m = 0
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) m = Math.max(m, haversineM(points[i]!, points[j]!))
  return m / 1000
}

function cross(o: XY, a: XY, b: XY) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}
function onSeg(p: XY, q: XY, r: XY) {
  return (
    Math.min(p[0], r[0]) <= q[0] &&
    q[0] <= Math.max(p[0], r[0]) &&
    Math.min(p[1], r[1]) <= q[1] &&
    q[1] <= Math.max(p[1], r[1])
  )
}
function segmentsIntersect(p1: XY, p2: XY, p3: XY, p4: XY): boolean {
  const d1 = cross(p3, p4, p1),
    d2 = cross(p3, p4, p2),
    d3 = cross(p1, p2, p3),
    d4 = cross(p1, p2, p4)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  return (
    (d1 === 0 && onSeg(p3, p1, p4)) ||
    (d2 === 0 && onSeg(p3, p2, p4)) ||
    (d3 === 0 && onSeg(p1, p3, p2)) ||
    (d4 === 0 && onSeg(p1, p4, p2))
  )
}

function selfIntersects(ring: XY[]): boolean {
  const n = ring.length - 1 // closed ring: n segments
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue // adjacent segments share a vertex
      if (segmentsIntersect(ring[i]!, ring[i + 1]!, ring[j]!, ring[j + 1]!)) return true
    }
  }
  return false
}

function shoelaceKm2(ring: XY[]): number {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) a += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1]
  return Math.abs(a / 2) / 1e6
}

export function summarizeAoi(input: AoiInput): AoiResult {
  const issues: Issue[] = []
  if (input.kind === 'site') {
    // One outer ring only: holes would pass through unvalidated and unmeasured, so reject them.
    if (input.geometry.coordinates.length !== 1) return { ok: false, issues: [{ code: 'out_of_range' }] }
    const ring = input.geometry.coordinates[0] ?? []
    const L = LIMITS.site
    if (!ring.every(inRange) || crossesAntimeridian(ring))
      return { ok: false, issues: [{ code: 'out_of_range' }] }
    const first = ring[0],
      last = ring[ring.length - 1]
    if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) issues.push({ code: 'not_closed' })
    if (ring.length < 4) issues.push({ code: 'too_few_points', value: ring.length, limit: 4 })
    if (ring.length - 1 > L.maxVertices)
      issues.push({ code: 'too_many_vertices', value: ring.length - 1, limit: L.maxVertices })
    if (issues.length) return { ok: false, issues }
    const c = ring.reduce<LonLat>(
      (acc, p) => [acc[0] + p[0] / ring.length, acc[1] + p[1] / ring.length],
      [0, 0],
    )
    const epsg = utmEpsgFor(c[0], c[1])
    const utm = ring.map((p) => toUtm(epsg, p))
    if (selfIntersects(utm)) issues.push({ code: 'self_intersects' })
    const areaKm2 = shoelaceKm2(utm)
    if (areaKm2 < L.minAreaKm2) issues.push({ code: 'too_small', value: areaKm2, limit: L.minAreaKm2 })
    const extentKm = maxPairwiseKm(ring)
    if (areaKm2 > L.maxAreaKm2) issues.push({ code: 'too_large', value: areaKm2, limit: L.maxAreaKm2 })
    if (extentKm > L.maxExtentKm) issues.push({ code: 'too_wide', value: extentKm, limit: L.maxExtentKm })
    if (issues.length) return { ok: false, issues }
    const geometry = toAoiGeometry(input)
    return {
      ok: true,
      summary: {
        kind: 'site',
        areaKm2,
        extentKm,
        lengthKm: null,
        bbox: bboxOf(ring),
        parts: partsOf(geometry),
      },
    }
  }
  const line = input.geometry.coordinates
  const L = LIMITS.road
  if (!line.every(inRange) || crossesAntimeridian(line))
    return { ok: false, issues: [{ code: 'out_of_range' }] }
  if (line.length < 2) issues.push({ code: 'too_few_points', value: line.length, limit: 2 })
  if (line.length > L.maxVertices)
    issues.push({ code: 'too_many_vertices', value: line.length, limit: L.maxVertices })
  if (!Number.isInteger(input.widthM) || input.widthM < L.minWidthM || input.widthM > L.maxWidthM)
    issues.push({ code: 'bad_width', value: input.widthM })
  const lengthKm = lineLengthM(line) / 1000
  if (lengthKm < L.minLengthKm) issues.push({ code: 'too_short', value: lengthKm, limit: L.minLengthKm })
  if (lengthKm > L.maxLengthKm) issues.push({ code: 'too_long', value: lengthKm, limit: L.maxLengthKm })
  if (issues.length) return { ok: false, issues }
  const [w, s, e, n] = bboxOf(line)
  const midLat = (s + n) / 2
  const dLat = input.widthM / 2 / 111320
  const dLon = dLat / Math.max(0.01, Math.cos((midLat * Math.PI) / 180))
  const geometry = toAoiGeometry(input)
  return {
    ok: true,
    summary: {
      kind: 'road',
      areaKm2: (lengthKm * input.widthM) / 1000,
      extentKm: maxPairwiseKm(line),
      lengthKm,
      bbox: [w - dLon, s - dLat, e + dLon, n + dLat],
      parts: partsOf(geometry, L.sectionM),
    },
  }
}
