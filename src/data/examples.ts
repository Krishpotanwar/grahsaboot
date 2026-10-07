import type { AoiInput } from '../geo/aoi.ts'
import type { Place } from '../search/nominatim.ts'
import { squareAround } from '../geo/square.ts'

/**
 * Worked examples: real places with large, unambiguous visible change inside the Sentinel-2 archive.
 * `before` and `after` are real clear passes the workbench opens on (see `newInvestigation`), so the example shows photos at once.
 */
export const EXAMPLES: Record<
  string,
  {
    name: string
    aoi: AoiInput
    dateFrom: string
    dateTo: string
    place: Place
    before?: string
    after?: string
  }
> = {
  'navi-mumbai-airport': {
    name: 'Navi Mumbai airport site',
    // Centre from OpenStreetMap Nominatim (2026-10-05). The 2 km square fits the 9 km² limit.
    aoi: {
      kind: 'site',
      geometry: { type: 'Polygon', coordinates: [squareAround(73.06575, 18.99135, 2000)] },
    },
    dateFrom: '2017-12-01',
    dateTo: '2025-12-31',
    before: '2018-02-22',
    after: '2025-12-12',
    place: { name: 'Navi Mumbai International Airport', lat: 18.99135, lon: 73.06575, bbox: null },
  },
}
