export interface ParsedCoords {
  lat: number
  lon: number
  swappedHint: boolean
}

const NUM = String.raw`([-+]?\d+(?:\.\d+)?)`
const URL_PAIR = new RegExp(String.raw`[@=]${NUM},\s*${NUM}`)
const HEMI = new RegExp(String.raw`^${NUM}\s*°?\s*([NS])[\s,;]+${NUM}\s*°?\s*([EW])$`, 'i')
const PLAIN = new RegExp(String.raw`^${NUM}[\s,;]+${NUM}$`)

export function parseCoordinates(input: string): ParsedCoords | null {
  const s = input.trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s)) {
    const m = s.match(URL_PAIR)
    return m ? make(Number(m[1]), Number(m[2])) : null
  }
  const h = s.match(HEMI)
  if (h) {
    const lat = Number(h[1]) * (/s/i.test(h[2]!) ? -1 : 1)
    const lon = Number(h[3]) * (/w/i.test(h[4]!) ? -1 : 1)
    return make(lat, lon)
  }
  const p = s.match(PLAIN)
  return p ? make(Number(p[1]), Number(p[2])) : null
}

function make(lat: number, lon: number): ParsedCoords | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  // India-first hint: "79.08, 21.14" is a valid Arctic point but almost always a swapped Indian lon/lat.
  const swappedHint = lat >= 68 && lat <= 98 && lon >= 6 && lon <= 37
  return { lat, lon, swappedHint }
}
