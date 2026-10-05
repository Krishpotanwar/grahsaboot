import proj4 from 'proj4'
import type { Converter } from 'proj4'
import type { LonLat, XY } from './types.ts'

const cache = new Map<number, Converter>()

export function utmEpsgFor(lon: number, lat: number): number {
  const zone = Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1))
  return (lat < 0 ? 32700 : 32600) + zone
}

export function utmConverter(epsg: number): Converter {
  const hit = cache.get(epsg)
  if (hit) return hit
  const north = epsg >= 32601 && epsg <= 32660
  const south = epsg >= 32701 && epsg <= 32760
  if (!north && !south) throw new Error(`UNSUPPORTED_EPSG:${epsg}`)
  const def = `+proj=utm +zone=${epsg % 100}${south ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`
  const conv = proj4('EPSG:4326', def)
  cache.set(epsg, conv)
  return conv
}

export const toUtm = (epsg: number, p: LonLat): XY => utmConverter(epsg).forward([p[0], p[1]]) as XY
export const fromUtm = (epsg: number, p: XY): LonLat => utmConverter(epsg).inverse([p[0], p[1]]) as LonLat

const R = 6378137
const MAX_LAT = 85.0511287798066

export function toMercator([lon, lat]: LonLat): XY {
  const phi = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180
  return [(R * lon * Math.PI) / 180, R * Math.log(Math.tan(Math.PI / 4 + phi / 2))]
}

export function fromMercator([x, y]: XY): LonLat {
  return [((x / R) * 180) / Math.PI, ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI]
}
