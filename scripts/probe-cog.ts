import { aoiPixelWindow, aoiPointsUtm, levelInfoFor, openCogUrl, sha256Hex } from '../src/evidence/index.ts'
import type { LonLat } from '../src/evidence/types.ts'

const SQUARE: LonLat[] = [
  [79.0832, 21.1408],
  [79.0932, 21.1408],
  [79.0932, 21.1508],
  [79.0832, 21.1508],
  [79.0832, 21.1408],
]
const itemId =
  (globalThis as { process?: { argv: string[] } }).process?.argv[2] ??
  (globalThis as { Deno?: { args: string[] } }).Deno?.args[0]

async function pickItem(): Promise<any> {
  if (itemId) {
    const r = await fetch(
      `https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/${itemId}`,
    )
    return r.json()
  }
  const r = await fetch('https://earth-search.aws.element84.com/v1/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      collections: ['sentinel-2-l2a'],
      bbox: [79.0, 21.1, 79.1, 21.2],
      datetime: '2026-01-01T00:00:00Z/2026-05-31T23:59:59Z',
      limit: 50,
      sortby: [{ field: 'properties.eo:cloud_cover', direction: 'asc' }],
    }),
  })
  return (await r.json()).features[0]
}

const t0 = Date.now()
const it = await pickItem()
const epsg = it.properties['proj:epsg'] as number
const aoi = { kind: 'site' as const, rings: [SQUARE] }
const out: Record<string, unknown> = { item: it.id, date: it.properties.datetime }
for (const [key, samples] of [
  ['scl', [0]],
  ['visual', [0, 1, 2]],
] as const) {
  const asset = { transform: it.assets[key]['proj:transform'], shape: it.assets[key]['proj:shape'] }
  const cog = await openCogUrl(it.assets[key].href)
  const lvl = levelInfoFor(asset, cog, 0)
  const win = aoiPixelWindow(aoiPointsUtm(aoi, epsg), lvl, 2)!.clamped
  const bytes = await cog.read(0, win, [...samples])
  out[`${key}Window`] = win
  out[`${key}Sha`] = await sha256Hex(bytes)
}
out.ms = Date.now() - t0
console.log(JSON.stringify(out))
