import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  json2satrec,
  propagate,
  type SatRec,
} from 'satellite.js'
import type { LonLat } from '../evidence/types.ts'

export type Omm = Parameters<typeof json2satrec>[0]
const R = 6371.0088
const RAD = Math.PI / 180

export const toSatrec = (o: Omm): SatRec => json2satrec(o)

export function subPoint(rec: SatRec, t: Date): { lon: number; lat: number; heightKm: number } | null {
  const pv = propagate(rec, t)
  if (!pv) return null
  const g = eciToGeodetic(pv.position, gstime(t))
  return { lon: degreesLong(g.longitude), lat: degreesLat(g.latitude), heightKm: g.height }
}

export function haversineKm(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * RAD
  const dLon = (b[0] - a[0]) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function bearing(a: LonLat, b: LonLat): number {
  const φ1 = a[1] * RAD,
    φ2 = b[1] * RAD,
    Δλ = (b[0] - a[0]) * RAD
  return (
    Math.atan2(
      Math.sin(Δλ) * Math.cos(φ2),
      Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ),
    ) / RAD
  )
}

function destination([lon, lat]: LonLat, brgDeg: number, km: number): LonLat {
  const δ = km / R,
    θ = brgDeg * RAD,
    φ1 = lat * RAD
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 =
    lon * RAD +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
  return [λ2 / RAD, φ2 / RAD]
}

/** Track over [center - minutes, center + minutes]; longitudes are unwrapped so lines never jump across ±180°. */
export function groundTrack(rec: SatRec, center: Date, minutes = 45, stepS = 30): LonLat[] {
  const out: LonLat[] = []
  for (let s = -minutes * 60; s <= minutes * 60; s += stepS) {
    const p = subPoint(rec, new Date(center.getTime() + s * 1000))
    if (!p) continue
    let lon = p.lon
    const prev = out[out.length - 1]
    if (prev) {
      while (lon - prev[0] > 180) lon -= 360
      while (lon - prev[0] < -180) lon += 360
    }
    out.push([lon, p.lat])
  }
  return out
}

export function swathRing(track: LonLat[], halfKm: number): LonLat[] {
  const left: LonLat[] = []
  const right: LonLat[] = []
  track.forEach((p, i) => {
    const b = bearing(track[Math.max(0, i - 1)]!, track[Math.min(track.length - 1, i + 1)]!)
    const l = destination(p, b - 90, halfKm)
    const r = destination(p, b + 90, halfKm)
    // keep ring longitudes in the same unwrapped frame as the track
    left.push([l[0] + Math.round((p[0] - l[0]) / 360) * 360, l[1]])
    right.push([r[0] + Math.round((p[0] - r[0]) / 360) * 360, r[1]])
  })
  const ring = [...left, ...right.reverse()]
  ring.push(ring[0]!)
  return ring
}

/** Local minima of distance to `target` that are descending (north to south), in local solar daytime (08–14 h), within the half swath. */
export function nextPasses(
  rec: SatRec,
  target: LonLat,
  halfKm: number,
  from: Date,
  days = 10,
  stepS = 60,
): Array<{ time: Date; distanceKm: number }> {
  const out: Array<{ time: Date; distanceKm: number }> = []
  let prev: { t: Date; lat: number; lon: number; d: number } | null = null
  let prevPrevD = Infinity
  for (let s = 0; s <= days * 86400; s += stepS) {
    const t = new Date(from.getTime() + s * 1000)
    const p = subPoint(rec, t)
    if (!p) continue
    const d = haversineKm(target, [p.lon, p.lat])
    if (prev && prev.d < prevPrevD && prev.d <= d) {
      const descending = p.lat < prev.lat
      const solar = (((prev.t.getUTCHours() + prev.t.getUTCMinutes() / 60 + prev.lon / 15) % 24) + 24) % 24
      if (descending && solar >= 8 && solar <= 14 && prev.d <= halfKm)
        out.push({ time: prev.t, distanceKm: prev.d })
    }
    prevPrevD = prev?.d ?? Infinity
    prev = { t, lat: p.lat, lon: p.lon, d }
  }
  return out
}
