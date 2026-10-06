import type { FeatureCollection } from 'geojson'
import { SATELLITES } from './catalog.ts'
import { groundTrack, nextPasses, subPoint, swathRing, toSatrec, type Omm } from './orbit.ts'
import type { SatRec } from 'satellite.js'
import type { LonLat } from '../evidence/types.ts'

const ctx = self as unknown as Worker
let recs: Array<{ def: (typeof SATELLITES)[number]; rec: SatRec }> = []

ctx.onmessage = (e: MessageEvent) => {
  const msg = e.data as
    | { op: 'init'; omm: Omm[] }
    | { op: 'tick'; t: number; withTracks: boolean }
    | { op: 'passes'; id: number; target: LonLat; from: number }
  if (msg.op === 'init') {
    recs = SATELLITES.flatMap((def) => {
      const o = msg.omm.find((x) => Number(x.NORAD_CAT_ID) === def.norad)
      return o ? [{ def, rec: toSatrec(o) }] : []
    })
    return
  }
  if (msg.op === 'tick') {
    const t = new Date(msg.t)
    const sats = recs.flatMap(({ def, rec }) => {
      const p = subPoint(rec, t)
      return p ? [{ norad: def.norad, name: def.name, lon: p.lon, lat: p.lat }] : []
    })
    let tracks: FeatureCollection | undefined
    let swaths: FeatureCollection | undefined
    if (msg.withTracks) {
      const lines = recs.map(({ def, rec }) => ({ def, track: groundTrack(rec, t) }))
      tracks = {
        type: 'FeatureCollection',
        features: lines.map(({ def, track }) => ({
          type: 'Feature',
          properties: { norad: def.norad },
          geometry: { type: 'LineString', coordinates: track },
        })),
      }
      swaths = {
        type: 'FeatureCollection',
        features: lines.map(({ def, track }) => ({
          type: 'Feature',
          properties: { norad: def.norad },
          geometry: { type: 'Polygon', coordinates: [swathRing(track, def.swathKm / 2)] },
        })),
      }
    }
    ctx.postMessage({ op: 'tick', sats, tracks, swaths })
    return
  }
  const from = new Date(msg.from)
  const passes = recs.map(({ def, rec }) => ({
    norad: def.norad,
    name: def.name,
    times: nextPasses(rec, msg.target, def.swathKm / 2, from).map((p) => ({
      time: p.time.getTime(),
      distanceKm: p.distanceKm,
    })),
  }))
  ctx.postMessage({ op: 'passes', id: msg.id, passes })
}
