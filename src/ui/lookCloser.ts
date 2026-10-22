import type { Bbox } from '../geo/aoi.ts'
import { LIMITS } from '../geo/limits.ts'
import { flow } from './copy-flow.ts'

// What the Look-closer box links to, and the note that starts from it: Google's own pages for the middle of an outline. A click is
// a navigation: nothing here is fetched, stored, hashed or put in a report (design, "What counts as evidence": Street View is a link).

/** Six decimals, about 0.1 m. `toFixed` never writes the exponent form for a latitude or a longitude, where `String(1e-7)` would. */
const at = (lat: number, lon: number): string => `${lat.toFixed(6)},${lon.toFixed(6)}`

/** Google's official Maps URL for a Street View panorama at a point. It needs no key. */
export const streetViewUrl = (lat: number, lon: number): string =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${at(lat, lon)}`

/**
 * Google Earth on the point, looking straight down from about 2 km. shortcut: Google does not document this form, so it is
 * checked by hand before a deploy; if it fails, `lookCloserLinks` gives `satelliteMapUrl` as `earth` and `flow.lookCloser.earth`
 * says "Satellite map".
 */
export const earthUrl = (lat: number, lon: number): string =>
  `https://earth.google.com/web/@${at(lat, lon)},0a,2000d,35y,0h,0t,0r`

/** The fallback for `earthUrl`: Google's documented Maps URL on its satellite layer, about 2 km across. */
export const satelliteMapUrl = (lat: number, lon: number): string =>
  `https://www.google.com/maps/@?api=1&map_action=map&center=${at(lat, lon)}&zoom=16&basemap=satellite`

export interface LookCloserLinks {
  streetView: string
  earth: string
}

/**
 * The links for the middle of an outline's box (a road's box is its line's, widened evenly), or null when that middle is not a
 * place on Earth. shortcut: the middle of the box, not of the road, so a bent road's can lie off it; use the point halfway along
 * the line if that ever matters.
 */
export function lookCloserLinks(bbox: Bbox): LookCloserLinks | null {
  const lon = (bbox[0] + bbox[2]) / 2
  const lat = (bbox[1] + bbox[3]) / 2
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null // a NaN fails the test too
  return { streetView: streetViewUrl(lat, lon), earth: earthUrl(lat, lon) }
}

/**
 * `body` with "Street View, " added, for the person to finish with the date Google's page shows (it never comes from today's
 * date). An empty note is filled; typed text is kept and the phrase goes on a new line. Null when it would pass the note cap: a
 * text box stops typing there, a value set from code does not.
 */
export function withGroundNote(body: string): string | null {
  const start = flow.lookCloser.groundNoteStart
  const next = body.trim() === '' ? start : `${body}${body.endsWith('\n') ? '' : '\n'}${start}`
  return next.length > LIMITS.notes.maxChars ? null : next
}
