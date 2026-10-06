import { isAllowedAssetUrl } from '../config.ts'
import type { LonLat } from '../evidence/types.ts'
import type { AssetRef, Collection, S2Item } from './types.ts'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const nums = (v: unknown, n: number) =>
  Array.isArray(v) && v.length >= n && v.every((x) => typeof x === 'number') ? (v as number[]) : null

function asset(raw: unknown, props: Obj): AssetRef | null {
  if (!isObj(raw)) return null
  const href = str(raw.href)
  const transform = nums(raw['proj:transform'] ?? props['proj:transform'], 6)
  const shape = nums(raw['proj:shape'] ?? props['proj:shape'], 2)
  if (!href || !transform || !shape || !isAllowedAssetUrl(href)) return null
  return { href, transform: transform.slice(0, 6), shape: [shape[0]!, shape[1]!] }
}

const isRing = (r: unknown): r is LonLat[] =>
  Array.isArray(r) &&
  r.length >= 3 &&
  r.every((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))

/** Outer rings only; malformed ones are dropped so one bad item cannot break point-in-ring selection. */
function rings(geom: unknown): LonLat[][] | null {
  if (!isObj(geom) || !Array.isArray(geom.coordinates)) return null
  const outer =
    geom.type === 'Polygon'
      ? [geom.coordinates[0]]
      : geom.type === 'MultiPolygon'
        ? geom.coordinates.map((p) => (Array.isArray(p) ? p[0] : null))
        : []
  const ok = outer.filter(isRing)
  return ok.length ? ok : null
}

export function parseItem(raw: unknown, collection: Collection): S2Item | null {
  if (!isObj(raw) || !isObj(raw.properties) || !isObj(raw.assets)) return null
  const id = str(raw.id)
  const p = raw.properties
  const datetime = str(p.datetime)
  if (!id || !datetime || Number.isNaN(Date.parse(datetime))) return null
  const code = str(p['proj:code'])
  const epsg = num(p['proj:epsg']) ?? (code?.startsWith('EPSG:') ? Number(code.slice(5)) : null)
  const visual = asset(raw.assets.visual, p)
  const scl = asset(raw.assets.scl ?? raw.assets.SCL, p)
  const footprint = rings(raw.geometry)
  if (!epsg || !visual || !scl || !footprint) return null
  return {
    id,
    collection,
    datetime,
    date: new Date(datetime).toISOString().slice(0, 10),
    epsg,
    cloudCover: num(p['eo:cloud_cover']),
    baseline: str(p['s2:processing_baseline']),
    nodataPct: num(p['s2:nodata_pixel_percentage']),
    footprint,
    visual,
    scl,
  }
}
