import { beforeEach, describe, expect, it } from 'vitest'
import { openCogBuffer, sha256Hex, type AoiGeometry } from '../../src/evidence/index.ts'
import { clearCogCache, runQuality } from '../../src/workers/imagery-core.ts'
import {
  handleVerify,
  type InvestigationRow,
  type ItemLite,
  type VerifyDeps,
} from '../../supabase/functions/verify/handler.ts'
import {
  FIXTURE_DATES,
  FIXTURE_EPSG,
  FIXTURE_ROAD,
  NAGPUR_SQUARE,
  SCL_SHAPE,
  SCL_TRANSFORM,
  TCI_SHAPE,
  TCI_TRANSFORM,
  makeScl,
  makeTci,
  toArrayBuffer,
} from '../fixtures/scene.ts'

// The verify handler (Deno, run here as plain TypeScript) and the browser's runQuality must give the same SCL quality for the
// same window: that is what lets the server's answer stand next to the browser's label in a report (spec §5.5).
const HREF = {
  visual: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/f/TCI.tif',
  scl: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/f/SCL.tif',
}
const ITEM: ItemLite = {
  id: 'S2B_44QKJ_20250305_0_L2A',
  collection: 'sentinel-2-l2a',
  datetime: '2025-03-05T05:30:00Z',
  epsg: FIXTURE_EPSG,
  baseline: '05.11',
  footprint: [
    [
      [78.9, 21.0],
      [79.3, 21.0],
      [79.3, 21.3],
      [78.9, 21.3],
      [78.9, 21.0],
    ],
  ],
  visual: { href: HREF.visual, transform: TCI_TRANSFORM, shape: TCI_SHAPE },
  scl: { href: HREF.scl, transform: SCL_TRANSFORM, shape: SCL_SHAPE },
}
// A mixed raster: part of the outline is clear, part is obstructed.
const files: Record<string, Uint8Array> = {
  [HREF.visual]: makeTci(false),
  [HREF.scl]: makeScl(FIXTURE_DATES[1]!.scl),
}
const open = (href: string) => openCogBuffer(toArrayBuffer(files[href]!))
const USER = '00000000-0000-4000-8000-00000000000a'
const base = {
  id: '11111111-1111-4111-8111-111111111111',
  owner: USER,
  date_from: '2025-01-01',
  date_to: '2025-12-31',
  pinned: ['2025-03-05'],
}
const CASES: Array<[string, AoiGeometry, InvestigationRow]> = [
  [
    'site',
    { kind: 'site', rings: [NAGPUR_SQUARE] },
    {
      ...base,
      kind: 'site',
      geom_geojson: { type: 'Polygon', coordinates: [NAGPUR_SQUARE] },
      road_width_m: null,
    },
  ],
  [
    'road',
    { kind: 'road', line: FIXTURE_ROAD, widthM: 30 },
    {
      ...base,
      kind: 'road',
      geom_geojson: { type: 'LineString', coordinates: FIXTURE_ROAD },
      road_width_m: 30,
    },
  ],
]

beforeEach(() => clearCogCache())

describe("verify's SCL quality is the browser's runQuality for the same window", () => {
  it.each(CASES)('%s', async (_name, aoi, inv) => {
    const browser = await runQuality(
      { openCog: async (href) => open(href) },
      {
        item: { ...ITEM, date: '2025-03-05', cloudCover: 48, nodataPct: 0 } as never,
        aoi,
      },
    )
    const sha256 = await sha256Hex(await (await open(HREF.scl)).read(0, browser.window, [0]))
    const deps: VerifyDeps = {
      userId: USER,
      loadInvestigation: async () => inv,
      countRecentFrames: async () => 0,
      recordChecks: async () => {},
      fetchItem: async () => ITEM,
      headAsset: async () => ({}),
      openCog: async (href) => open(href),
      pruneFrames: async () => {},
      saveFrames: async (rows) => rows.map((_, i) => ({ id: `f${i}`, verified_at: '2026-01-01T00:00:00Z' })),
    }
    const r = await handleVerify(deps, {
      investigation_id: inv.id,
      item: { collection: 'sentinel-2-l2a', id: ITEM.id },
      frames: [{ asset: 'scl', level: 0, window: browser.window, sha256 }],
    })
    expect(r.status).toBe(200)
    const f = (r.body as { frames: Array<{ status: string; server_sha256: string; quality: unknown }> })
      .frames[0]!
    expect(f.status).toBe('verified')
    expect(f.server_sha256).toBe(browser.sha256)
    expect(f.quality).toEqual({
      ...browser.stats,
      parts: browser.parts.map((p) => ({ idx: p.idx, fromM: p.fromM, toM: p.toM, ...p.stats })),
    })
    // Not vacuous: the raster is mixed (clear and obstructed cells inside the outline).
    expect(browser.stats.counts[5]).toBeGreaterThan(0)
    expect(browser.stats.counts[8]).toBeGreaterThan(0)
  })
})
