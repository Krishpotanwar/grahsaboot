import type { LonLat } from '../evidence/types.ts'

/** Closed square ring of `sideM` metres centred on (lon, lat), using spherical metres per degree (consistent with geodesy.ts). */
export function squareAround(lon: number, lat: number, sideM: number): LonLat[] {
  const dLat = sideM / 2 / 111195.08
  const dLon = dLat / Math.cos((lat * Math.PI) / 180)
  const r = (v: number) => Math.round(v * 1e7) / 1e7
  const ring: LonLat[] = [
    [r(lon - dLon), r(lat - dLat)],
    [r(lon + dLon), r(lat - dLat)],
    [r(lon + dLon), r(lat + dLat)],
    [r(lon - dLon), r(lat + dLat)],
  ]
  return [...ring, ring[0]!]
}
