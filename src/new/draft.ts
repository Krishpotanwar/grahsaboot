import type { LonLat } from '../evidence/types.ts'
import type { AoiInput } from '../geo/aoi.ts'
import { LIMITS } from '../geo/limits.ts'
import { placeLabel } from '../map/camera.ts'
import type { Place } from '../search/nominatim.ts'
import { copy } from '../ui/copy.ts'
import { EXAMPLES } from '../data/examples.ts'
export { squareAround } from '../geo/square.ts'

export interface Draft {
  place: Place | null
  kind: 'site' | 'road'
  ring: LonLat[] | null
  line: LonLat[] | null
  widthM: number
  dateFrom: string
  dateTo: string
  name: string
  /** A known pair of passes to open on; only a worked example has one. */
  before?: string | null
  after?: string | null
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10)

export function defaultDates(today = new Date()): { dateFrom: string; dateTo: string } {
  const from = ymd(
    new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - LIMITS.dates.defaultMonths, today.getUTCDate()),
    ),
  )
  return { dateFrom: from < LIMITS.dates.earliest ? LIMITS.dates.earliest : from, dateTo: ymd(today) }
}

export function validateDates(
  from: string,
  to: string,
  today = new Date(),
): 'order' | 'early' | 'future' | null {
  if (!from || !to || from >= to) return 'order'
  if (from < LIMITS.dates.earliest) return 'early'
  if (to > ymd(today)) return 'future'
  return null
}

export function draftToAoi(d: Draft): AoiInput | null {
  if (d.kind === 'site')
    return d.ring ? { kind: 'site', geometry: { type: 'Polygon', coordinates: [d.ring] } } : null
  return d.line
    ? { kind: 'road', geometry: { type: 'LineString', coordinates: d.line }, widthM: d.widthM }
    : null
}

/** The name follows the place until the user types their own: empty, or still the previous place's label. */
export const nameForPlace = (d: Draft, p: Place) =>
  !d.name || (d.place && d.name === placeLabel(d.place)) ? placeLabel(p) : d.name

/** A worked example's before/after pair belongs to its own place and outline: change either and the pair goes. */
export const dropStalePair = (prev: Draft, next: Draft): Draft =>
  next.place === prev.place && next.ring === prev.ring && next.line === prev.line
    ? next
    : { ...next, before: null, after: null }

export function emptyDraft(today = new Date()): Draft {
  return {
    place: null,
    kind: 'site',
    ring: null,
    line: null,
    widthM: LIMITS.road.defaultWidthM,
    ...defaultDates(today),
    name: '',
    before: null,
    after: null,
  }
}

export function draftFromParams(
  p: URLSearchParams,
  today = new Date(),
): { draft: Draft; step: 1 | 2 | 3 | 4 } {
  const base = emptyDraft(today)
  // The query string is untrusted: own keys only, so `?example=constructor` is not an example.
  const key = p.get('example') ?? ''
  const ex = Object.hasOwn(EXAMPLES, key) ? EXAMPLES[key] : undefined
  if (ex) {
    return {
      step: 4,
      draft: {
        ...base,
        place: ex.place,
        name: ex.name,
        dateFrom: ex.dateFrom,
        dateTo: ex.dateTo,
        before: ex.before ?? null,
        after: ex.after ?? null,
        kind: ex.aoi.kind,
        ring: ex.aoi.kind === 'site' ? ex.aoi.geometry.coordinates[0]! : null,
        line: ex.aoi.kind === 'road' ? ex.aoi.geometry.coordinates : null,
        widthM: ex.aoi.kind === 'road' ? ex.aoi.widthM : base.widthM,
      },
    }
  }
  // A missing or empty value is not 0: `?lat=&lon=` must not open a place at 0, 0.
  const num = (k: string) => (p.get(k)?.trim() ? Number(p.get(k)) : NaN)
  const lat = num('lat'),
    lon = num('lon')
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    const name = (p.get('name') ?? '').slice(0, 120)
    return {
      step: 2,
      draft: {
        ...base,
        place: { name: name || copy.search.coordsResult(lat, lon), lat, lon, bbox: null },
        name,
      },
    }
  }
  return { step: 1, draft: base }
}
