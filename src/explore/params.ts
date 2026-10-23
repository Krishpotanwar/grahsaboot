import { parseCoordinates } from '../geo/coords.ts'
import { plainNumber } from '../lib/dates.ts'
import { placeToQuery } from '../map/camera.ts'
import type { Place } from '../search/nominatim.ts'
import { copy } from '../ui/copy.ts'

/** The square of a time-lapse, in metres: 2 km a side, around the place. */
export const SIDE_M = 2000

/** The address of the time-lapse of a place: the investigation link's own query (`placeToQuery`) on `/explore`. */
export const exploreHref = (p: Place): string => placeToQuery(p).replace(/^\/new/, '/explore')

/** One key for a place, as the home screen writes it and the page reads it back: both go through the 6 decimals the address carries. */
export const startKey = (p: Pick<Place, 'lat' | 'lon'>): string => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`

/**
 * The place an `/explore` address names, or null when it names none. The address is text anyone can edit: the latitude and the
 * longitude must be plain numbers (digits, an optional minus sign and decimals: no hex, no exponent, no spaces, no plus sign) inside
 * the world; the name is shown as text, cut at 120 characters; every other parameter is left unread.
 */
export function placeFromParams(p: URLSearchParams): Place | null {
  const lat = p.get('lat')
  const lon = p.get('lon')
  if (plainNumber(lat) === undefined || plainNumber(lon) === undefined) return null
  const c = parseCoordinates(`${lat}, ${lon}`)
  if (!c) return null
  const name = Array.from((p.get('name') ?? '').trim())
    .slice(0, 120)
    .join('') // by characters: a cut inside an emoji would make encodeURIComponent throw
  return { name: name || copy.search.coordsResult(c.lat, c.lon), lat: c.lat, lon: c.lon, bbox: null }
}
