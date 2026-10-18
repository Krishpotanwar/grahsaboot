// P11 (scratch grade, kept for the record): what a single recent Sentinel-2 scene looks like as an orientation picture at street
// zoom, for the owner's G0 decision. For each place: search the last 240 days, rank the scenes the way the plan's loader would
// (covers the place, least cloud, newest), check the SCL of the best three, read ONE true-colour frame, and write the picture at
// three zooms. No UI, no map; the browser would draw this picture with bilinear filtering, which is what `sharp` does here.
// Run: npx tsx scripts/probe-e/render-scene.mts [outDir]
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'
import { makeDisplayGrid, openCogUrl } from '../../src/evidence/index.ts'
import type { LonLat } from '../../src/evidence/types.ts'
import { searchSentinel2 } from '../../src/stac/search.ts'
import { selectPerDate } from '../../src/stac/select.ts'
import { runFrame, runQuality } from '../../src/workers/imagery-core.ts'

const OUT = process.argv[2] ?? 'docs/screenshots/phase-e'
const PLACES: Record<string, [number, number]> = {
  'navi-mumbai-airport': [73.06575, 18.99135],
  'nagpur-centre': [79.0882, 21.1458],
  'village-near-nagpur': [79.2615, 21.0463],
}
const HALF_KM = 2 // a 4 km square: about what the outline step shows at z15
const DAYS = 240

const metresToDeg = (km: number, lat: number) => ({ dLat: km / 110.574, dLon: km / (111.32 * Math.cos((lat * Math.PI) / 180)) })
const deps = { openCog: (href: string) => openCogUrl(href) }
mkdirSync(OUT, { recursive: true })

for (const [name, [lon, lat]] of Object.entries(PLACES)) {
  const t0 = Date.now()
  const { dLat, dLon } = metresToDeg(HALF_KM, lat)
  const bbox: [number, number, number, number] = [lon - dLon, lat - dLat, lon + dLon, lat + dLat]
  const ring: LonLat[] = [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[1]],
    [bbox[2], bbox[3]],
    [bbox[0], bbox[3]],
    [bbox[0], bbox[1]],
  ]
  const to = new Date()
  const from = new Date(to.getTime() - DAYS * 86_400_000)
  const found = await searchSentinel2({ bbox, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) })
  const candidates = selectPerDate(found.items, ring).filter((c) => c.coversAoi)
  const ranked = candidates.sort((a, b) => (a.item.cloudCover ?? 100) - (b.item.cloudCover ?? 100) || b.date.localeCompare(a.date)).slice(0, 3)
  const aoi = { kind: 'site' as const, rings: [ring] }
  let best: { c: (typeof ranked)[number]; clear: number } | null = null
  const tried: string[] = []
  for (const c of ranked) {
    const q = await runQuality(deps, { item: c.item, aoi }).catch(() => null)
    const clear = q ? Math.round(q.stats.clearFraction * 100) : -1
    tried.push(`${c.date} scene cloud ${c.item.cloudCover}% -> region clear ${clear}%`)
    if (q && (!best || clear > best.clear)) best = { c, clear }
    if (clear >= 80) break
  }
  if (!best) {
    console.log(JSON.stringify({ name, error: 'NO_SCENE', found: found.items.length, tried }))
    continue
  }
  const grid = makeDisplayGrid(bbox, 800)
  const frame = await runFrame(deps, { item: best.c.item, level: 0, aoi, grid }).catch(() => null)
  if (!frame) {
    console.log(JSON.stringify({ name, error: 'FRAME_FAILED', scene: best.c.item.id }))
    continue
  }
  const { width, height, rgba } = frame.display
  const raw = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength)
  const base = sharp(raw, { raw: { width, height, channels: 4 } })
  await base.clone().png().toFile(`${OUT}/p11-${name}-z15.png`)
  for (const [z, frac] of [['z16', 0.5], ['z17', 0.25]] as const) {
    const side = Math.round(width * frac)
    const left = Math.round((width - side) / 2)
    await base.clone().extract({ left, top: Math.round((height - side) / 2), width: side, height: side }).resize(width, height, { kernel: 'cubic' }).png().toFile(`${OUT}/p11-${name}-${z}.png`)
  }
  const ageDays = Math.round((to.getTime() - new Date(best.c.item.datetime).getTime()) / 86_400_000)
  console.log(JSON.stringify({ name, scene: best.c.item.id, date: best.c.date, ageDays, regionClearPct: best.clear, tried, nativeBytes: frame.native.rgb.length, ms: Date.now() - t0 }))
}
