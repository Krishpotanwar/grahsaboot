import { describe, expect, it } from 'vitest'
import {
  defaultDates,
  draftFromParams,
  draftToAoi,
  emptyDraft,
  nameForPlace,
  squareAround,
  validateDates,
} from './draft.ts'
import { summarizeAoi } from '../geo/aoi.ts'
import type { Place } from '../search/nominatim.ts'
import { copy } from '../ui/copy.ts'

const TODAY = new Date('2026-10-05T10:00:00Z')

describe('draft helpers', () => {
  it('builds a closed square of the requested side', () => {
    const ring = squareAround(79.0882, 21.1458, 1000)
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual(ring[4])
    const r = summarizeAoi({ kind: 'site', geometry: { type: 'Polygon', coordinates: [ring] } })
    expect(r.ok && r.summary.areaKm2).toBeGreaterThan(0.99)
    expect(r.ok && r.summary.areaKm2).toBeLessThan(1.01)
  })
  it('defaults to the last 24 months', () => {
    expect(defaultDates(TODAY)).toEqual({ dateFrom: '2024-10-05', dateTo: '2026-10-05' })
    expect(defaultDates(new Date('2018-03-01T00:00:00Z')).dateFrom).toBe('2017-01-01')
  })
  it.each([
    ['2025-01-01', '2025-12-31', null],
    ['2025-12-31', '2025-01-01', 'order'],
    ['2016-12-31', '2025-01-01', 'early'],
    ['2025-01-01', '2026-10-06', 'future'],
  ] as const)('validateDates(%s, %s) = %s', (a, b, r) => {
    expect(validateDates(a, b, TODAY)).toBe(r)
  })
  it('turns drafts into AOI inputs', () => {
    const d = emptyDraft(TODAY)
    expect(draftToAoi(d)).toBeNull()
    expect(
      draftToAoi({
        ...d,
        kind: 'road',
        line: [
          [79, 21],
          [79.01, 21.01],
        ],
        widthM: 24,
      }),
    ).toEqual({
      kind: 'road',
      geometry: {
        type: 'LineString',
        coordinates: [
          [79, 21],
          [79.01, 21.01],
        ],
      },
      widthM: 24,
    })
  })
  it('reads URL parameters', () => {
    expect(draftFromParams(new URLSearchParams('lat=21.1458&lon=79.0882&name=Nagpur'), TODAY)).toMatchObject({
      step: 2,
      draft: { place: { name: 'Nagpur', lat: 21.1458, lon: 79.0882 } },
    })
    // No name in the link: the point is named like a searched coordinate pair ("Point at 21.14580, 79.08820").
    expect(draftFromParams(new URLSearchParams('lat=21.1458&lon=79.0882'), TODAY).draft.place?.name).toBe(
      copy.search.coordsResult(21.1458, 79.0882),
    )
    const ex = draftFromParams(new URLSearchParams('example=navi-mumbai-airport'), TODAY)
    expect(ex.step).toBe(4)
    expect(ex.draft.ring).toHaveLength(5)
    expect(draftFromParams(new URLSearchParams('lat=999&lon=0'), TODAY).step).toBe(1)
    // The query string is untrusted: inherited keys, empty values and half pairs are not a place.
    for (const q of ['example=constructor', 'example=__proto__', 'lat=&lon=', 'lat=21.1', 'lat=abc&lon=79'])
      expect(draftFromParams(new URLSearchParams(q), TODAY).step, q).toBe(1)
  })
  // The name follows the place until the user types their own (C2 carry-in C).
  it('names the investigation after the place until the user edits the name', () => {
    const nagpur: Place = {
      name: 'Nagpur, Maharashtra, India',
      lat: 21.1458,
      lon: 79.0882,
      bbox: [78.9, 21, 79.2, 21.3],
    }
    const pune: Place = {
      name: 'Pune, Maharashtra, India',
      lat: 18.52,
      lon: 73.85,
      bbox: [73.7, 18.4, 74, 18.6],
    }
    const point: Place = {
      name: copy.search.coordsResult(21.1458, 79.0882),
      lat: 21.1458,
      lon: 79.0882,
      bbox: null,
    }
    const empty = emptyDraft(TODAY)
    expect(nameForPlace(empty, nagpur)).toBe('Nagpur')
    const first = { ...empty, place: nagpur, name: 'Nagpur' }
    expect(nameForPlace(first, pune)).toBe('Pune') // untouched: follows the new place
    expect(nameForPlace({ ...first, name: '' }, pune)).toBe('Pune') // cleared: filled again
    expect(nameForPlace({ ...first, name: 'Airport apron' }, pune)).toBe('Airport apron') // the user's own name stays
    // A coordinate point keeps its whole name, comma included, both as the new name and as the "previous label".
    expect(nameForPlace(empty, point)).toBe(copy.search.coordsResult(21.1458, 79.0882))
    expect(nameForPlace({ ...empty, place: point, name: point.name }, pune)).toBe('Pune')
  })
})
