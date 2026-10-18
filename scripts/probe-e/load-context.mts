// E2 real-data check (scratch grade, kept for the record): the context loader (src/context/load.ts) against the real services.
// For each place: a 4 km view, the loader's region for it, then loadContext with the real STAC search and a client built from the
// worker's own functions (no worker thread, no browser). Prints the reason or the scene, date, age in days, clear %, whether the
// window widened, when each stage began (ms from the start) and the total. Run it once, not in a loop:
//   npx tsx scripts/probe-e/load-context.mts
import { loadContext, type ContextDeps } from '../../src/context/load.ts'
import { regionFor } from '../../src/context/region.ts'
import { openCogUrl } from '../../src/evidence/index.ts'
import type { Bbox } from '../../src/geo/aoi.ts'
import { searchSentinel2 } from '../../src/stac/search.ts'
import { resolveItemHrefs } from '../../src/stac/pc.ts'
import {
  runFrame,
  runQuality,
  type FrameRequest,
  type QualityRequest,
} from '../../src/workers/imagery-core.ts'

const PLACES: Record<string, [number, number]> = {
  'navi-mumbai-airport': [73.06575, 18.99135],
  'village-near-nagpur': [79.2615, 21.0463],
  'nagpur-centre': [79.0882, 21.1458],
}
const HALF_KM = 2 // a 4 km view

const metresToDeg = (km: number, lat: number) => ({
  dLat: km / 110.574,
  dLon: km / (111.32 * Math.cos((lat * Math.PI) / 180)),
})
const core = { openCog: openCogUrl }
// What the imagery client does before it posts to the worker: Planetary Computer hrefs need a signed token.
const client: ContextDeps['client'] = {
  quality: async (req: QualityRequest, signal?: AbortSignal) =>
    runQuality(core, { ...req, item: await resolveItemHrefs(req.item, signal) }, signal),
  frame: async (req: FrameRequest, signal?: AbortSignal) =>
    runFrame(core, { ...req, item: await resolveItemHrefs(req.item, signal) }, signal),
}

for (const [name, [lon, lat]] of Object.entries(PLACES)) {
  const { dLat, dLon } = metresToDeg(HALF_KM, lat)
  const view: Bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat]
  const { bbox: region, clamped } = regionFor(view)
  const t0 = Date.now()
  const stageStartMs: Record<string, number> = {}
  const r = await loadContext(
    { search: searchSentinel2, client, onStage: (s) => (stageStartMs[s] = Date.now() - t0) },
    region,
    new AbortController().signal,
  )
  const totalMs = Date.now() - t0
  if (r.ok || r.reason === 'ALL_CLOUDY') {
    const { rgba, grid, ...image } = r.image
    let opaque = 0
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 0) opaque++
    console.log(
      JSON.stringify({
        name,
        result: r.ok ? 'ok' : r.reason,
        ...image,
        gridPx: `${grid.width}x${grid.height}`,
        opaquePct: Math.round((opaque / (rgba.length / 4)) * 1000) / 10,
        clamped,
        stageStartMs,
        totalMs,
      }),
    )
  } else console.log(JSON.stringify({ name, result: r.reason, clamped, stageStartMs, totalMs }))
}
