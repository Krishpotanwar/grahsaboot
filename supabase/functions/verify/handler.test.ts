import { assertEquals } from 'jsr:@std/assert@1'
import {
  aoiPixelWindow,
  aoiPointsUtm,
  levelInfoFor,
  openCogBuffer,
  sha256Hex,
  type Cog,
} from '../_shared/evidence/index.ts'
import {
  FIXTURE_DATES,
  FIXTURE_ROAD,
  NAGPUR_SQUARE,
  SCL_SHAPE,
  SCL_TRANSFORM,
  TCI_SHAPE,
  TCI_TRANSFORM,
  makeScl,
  makeTci,
  toArrayBuffer,
} from '../../../tests/fixtures/scene.ts'
import { handleVerify, parseStacItem, type ItemLite, type VerifyDeps } from './handler.ts'

const USER = '00000000-0000-4000-8000-00000000000a'
const INV = {
  id: '11111111-1111-4111-8111-111111111111',
  owner: USER,
  kind: 'site' as const,
  geom_geojson: { type: 'Polygon', coordinates: [NAGPUR_SQUARE] },
  road_width_m: null,
  date_from: '2025-01-01',
  date_to: '2025-12-31',
  pinned: ['2025-12-20'],
}
const ITEM: ItemLite = {
  id: 'S2B_44QKJ_20251220_0_L2A',
  collection: 'sentinel-2-l2a',
  datetime: '2025-12-20T05:30:00Z',
  epsg: 32644,
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
  visual: {
    href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/f/TCI.tif',
    transform: TCI_TRANSFORM,
    shape: TCI_SHAPE,
  },
  scl: {
    href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/f/SCL.tif',
    transform: SCL_TRANSFORM,
    shape: SCL_SHAPE,
  },
}
const files: Record<string, Uint8Array> = {
  [ITEM.visual.href]: makeTci(true),
  [ITEM.scl.href]: makeScl(FIXTURE_DATES[3]!.scl),
}
const aoi = { kind: 'site' as const, rings: [NAGPUR_SQUARE] }

async function clientFrame(asset: 'visual' | 'scl', level: 0 | 1) {
  const a = asset === 'visual' ? ITEM.visual : ITEM.scl
  const cog = await openCogBuffer(toArrayBuffer(files[a.href]!))
  const lvl = levelInfoFor(a, cog, level)
  const window = aoiPixelWindow(aoiPointsUtm(aoi, ITEM.epsg), lvl, 2)!.clamped
  return {
    asset,
    level,
    window,
    sha256: await sha256Hex(await cog.read(level, window, asset === 'visual' ? [0, 1, 2] : [0])),
  }
}

function deps(over: Partial<VerifyDeps> = {}): VerifyDeps & { saved: unknown[]; calls: string[] } {
  const saved: unknown[] = []
  const calls: string[] = []
  return {
    saved,
    calls,
    userId: USER,
    loadInvestigation: async (id) => (id === INV.id ? INV : null),
    countRecentFrames: async () => 0,
    recordChecks: async (id, n) => {
      calls.push(`record ${id} ${n}`)
    },
    fetchItem: async (_c, id) => {
      calls.push('fetchItem')
      return id === ITEM.id ? ITEM : null
    },
    headAsset: async () => ({ etag: '"x"' }),
    openCog: async (href): Promise<Cog> => {
      calls.push('openCog')
      return openCogBuffer(toArrayBuffer(files[href]!))
    },
    pruneFrames: async (id, pinned, current) => {
      calls.push(`prune ${id} ${pinned.join(',')} ${current.date} ${current.itemId}`)
    },
    saveFrames: async (rows) => {
      calls.push('save')
      saved.push(...rows)
      return rows.map((_, i) => ({ id: `f${i}`, verified_at: '2026-10-05T10:00:00Z' }))
    },
    ...over,
  }
}
const body = async (frames: unknown[], over: Record<string, unknown> = {}) => ({
  investigation_id: INV.id,
  item: { collection: 'sentinel-2-l2a', id: ITEM.id },
  frames,
  ...over,
})

Deno.test('verifies matching client hashes and computes authoritative quality', async () => {
  const d = deps()
  const r = await handleVerify(d, await body([await clientFrame('scl', 0), await clientFrame('visual', 0)]))
  assertEquals(r.status, 200)
  const out = r.body as { frames: Array<{ status: string; quality?: { label: string } }> }
  assertEquals(
    out.frames.map((f) => f.status),
    ['verified', 'verified'],
  )
  assertEquals(out.frames[0]!.quality?.label, 'CLEAR')
  assertEquals((d.saved[1] as { recipe: string; level: number }).recipe, 'frame-v1')
})

Deno.test('stores a forged hash as mismatch, with both hashes on the stored row', async () => {
  const f = await clientFrame('visual', 1)
  const d = deps()
  const r = await handleVerify(d, await body([{ ...f, sha256: 'f'.repeat(64) }]))
  assertEquals(r.status, 200)
  assertEquals((r.body as { frames: Array<{ status: string }> }).frames[0]!.status, 'mismatch')
  const row = d.saved[0] as { status: string; client_sha256: string; server_sha256: string }
  assertEquals([row.status, row.client_sha256, row.server_sha256], ['mismatch', 'f'.repeat(64), PIN.sha256])
})

Deno.test('404 for an investigation the user cannot see (RLS returns nothing)', async () => {
  const r = await handleVerify(
    deps(),
    await body([await clientFrame('scl', 0)], { investigation_id: '22222222-2222-4222-8222-222222222222' }),
  )
  assertEquals(r, { status: 404, body: { error: 'INVESTIGATION_NOT_FOUND' } })
})

Deno.test('422 for a window that does not cover the outline', async () => {
  const f = await clientFrame('visual', 0)
  const r = await handleVerify(deps(), await body([{ ...f, window: [0, 0, 40, 40] }]))
  assertEquals(r, { status: 422, body: { error: 'BAD_WINDOW' } })
})

Deno.test('422 when the item date is outside the investigation range', async () => {
  const r = await handleVerify(
    deps({ fetchItem: async () => ({ ...ITEM, datetime: '2024-06-01T05:30:00Z' }) }),
    await body([await clientFrame('scl', 0)]),
  )
  assertEquals(r, { status: 422, body: { error: 'DATE_OUTSIDE_RANGE' } })
})

Deno.test('429 past 600 frames per day', async () => {
  const r = await handleVerify(
    deps({ countRecentFrames: async () => 599 }),
    await body([await clientFrame('scl', 0), await clientFrame('visual', 1)]),
  )
  assertEquals(r, { status: 429, body: { error: 'RATE_LIMITED' } })
})

Deno.test('502 when the source cannot be read', async () => {
  const r = await handleVerify(
    deps({
      openCog: async () => {
        throw new Error('S3 down')
      },
    }),
    await body([await clientFrame('scl', 0)]),
  )
  assertEquals(r, { status: 502, body: { error: 'UPSTREAM' } })
})

Deno.test(
  '400 for malformed bodies, path-like ids, a repeated frame key (so at most three frames pass), SCL above level 0',
  async () => {
    const f = await clientFrame('scl', 0)
    assertEquals((await handleVerify(deps(), null)).status, 400)
    assertEquals(
      (
        await handleVerify(
          deps(),
          await body([f], { item: { collection: 'sentinel-2-l2a', id: '../../etc' } }),
        )
      ).status,
      400,
    )
    assertEquals((await handleVerify(deps(), await body([f, f, f, f, f]))).status, 400)
    assertEquals((await handleVerify(deps(), await body([{ ...f, level: 1 }]))).status, 400)
  },
)

Deno.test('parseStacItem accepts allowlisted HTTPS hosts only', () => {
  const raw = {
    id: ITEM.id,
    properties: { datetime: ITEM.datetime, 'proj:epsg': 32644, 's2:processing_baseline': '05.11' },
    geometry: { type: 'Polygon', coordinates: ITEM.footprint },
    assets: {
      visual: { href: ITEM.visual.href, 'proj:transform': TCI_TRANSFORM, 'proj:shape': TCI_SHAPE },
      scl: { href: ITEM.scl.href, 'proj:transform': SCL_TRANSFORM, 'proj:shape': SCL_SHAPE },
    },
  }
  assertEquals(parseStacItem(raw, 'sentinel-2-l2a')?.epsg, 32644)
  assertEquals(
    parseStacItem(
      { ...raw, assets: { ...raw.assets, visual: { ...raw.assets.visual, href: 'http://127.0.0.1/x.tif' } } },
      'sentinel-2-l2a',
    ),
    null,
  )
})

Deno.test(
  '400 for two frames with the same asset and level: the upsert would fail after the reads (E2)',
  async () => {
    const f = await clientFrame('visual', 1)
    const d = deps()
    const r = await handleVerify(d, await body([f, { ...f, sha256: 'a'.repeat(64) }]))
    assertEquals(r, { status: 400, body: { error: 'BAD_REQUEST' } })
    assertEquals(d.saved, [])
  },
)

Deno.test(
  'counts attempts: 598 + 2 frames is allowed, 599 + 2 is 429 and the refused attempt is not recorded (E3)',
  async () => {
    const frames = [await clientFrame('scl', 0), await clientFrame('visual', 1)]
    assertEquals(
      (await handleVerify(deps({ countRecentFrames: async () => 598 }), await body(frames))).status,
      200,
    )
    const over = deps({ countRecentFrames: async () => 599 })
    assertEquals((await handleVerify(over, await body(frames))).status, 429)
    assertEquals(over.calls, [])
  },
)

Deno.test('503 and no source read when the count or the record cannot be made (fails closed)', async () => {
  const frames = await body([await clientFrame('scl', 0)])
  const unavailable = { status: 503, body: { error: 'UNAVAILABLE' } }
  const broken = deps({
    countRecentFrames: async () => {
      throw new Error('db down')
    },
  })
  assertEquals(await handleVerify(broken, frames), unavailable)
  assertEquals(broken.calls, [])
  // A count that is not a whole number is a failed count, never "zero used".
  const junk = deps({ countRecentFrames: async () => null as unknown as number })
  assertEquals(await handleVerify(junk, frames), unavailable)
  assertEquals(junk.calls, [])
  const noRecord = deps({
    recordChecks: async () => {
      throw new Error('db down')
    },
  })
  assertEquals(await handleVerify(noRecord, frames), unavailable)
  assertEquals(noRecord.calls, [])
  assertEquals(noRecord.saved, [])
})

Deno.test('records the attempt once with the frame count, before any call to the sources', async () => {
  const d = deps()
  const r = await handleVerify(d, await body([await clientFrame('scl', 0), await clientFrame('visual', 0)]))
  assertEquals(r.status, 200)
  assertEquals(d.calls.slice(0, 3), [`record ${INV.id} 2`, 'fetchItem', 'openCog'])
  assertEquals(d.calls.filter((c) => c.startsWith('record ')).length, 1)
})

Deno.test('a request that fails after the record still counted (502, 422)', async () => {
  const f = await clientFrame('scl', 0)
  const down = deps({
    openCog: async () => {
      throw new Error('S3 down')
    },
  })
  assertEquals((await handleVerify(down, await body([f]))).status, 502)
  assertEquals(down.calls, [`record ${INV.id} 1`, 'fetchItem'])
  const bad = deps()
  assertEquals((await handleVerify(bad, await body([{ ...f, window: [0, 0, 40, 40] }]))).status, 422)
  assertEquals(
    bad.calls.filter((c) => c.startsWith('record ')),
    [`record ${INV.id} 1`],
  )
  assertEquals(bad.saved, [])
})

Deno.test(
  "another user's investigation id: 404, nothing recorded, no source read, no frame written",
  async () => {
    const d = deps()
    const r = await handleVerify(
      d,
      await body([await clientFrame('scl', 0)], { investigation_id: '22222222-2222-4222-8222-222222222222' }),
    )
    assertEquals(r, { status: 404, body: { error: 'INVESTIGATION_NOT_FOUND' } })
    assertEquals(d.calls, [])
    assertEquals(d.saved, [])
  },
)

Deno.test(
  "404 when the loaded row is not the caller's, even if the loader returned it: nothing recorded, read or written",
  async () => {
    // The write path is the service role, so the handler asserts ownership itself (a loader built with the wrong client must
    // fail closed). frames.owner has no database constraint tying it to the investigation's owner (D1).
    const d = deps({
      loadInvestigation: async () => ({ ...INV, owner: '00000000-0000-4000-8000-0000000000bb' }),
    })
    const r = await handleVerify(d, await body([await clientFrame('scl', 0)]))
    assertEquals(r, { status: 404, body: { error: 'INVESTIGATION_NOT_FOUND' } })
    assertEquals(d.calls, [])
    assertEquals(d.saved, [])
  },
)

Deno.test("stamps every frame with the caller's id, taken from the loaded row", async () => {
  const d = deps()
  assertEquals(
    (await handleVerify(d, await body([await clientFrame('scl', 0), await clientFrame('visual', 1)]))).status,
    200,
  )
  assertEquals(
    d.saved.map((r) => (r as { owner: string }).owner),
    [USER, USER],
  )
})

Deno.test(
  '422 NOT_PINNED for a date the investigation does not pin; the attempt still counted, nothing saved (E11)',
  async () => {
    const d = deps({ loadInvestigation: async () => ({ ...INV, pinned: ['2025-03-05'] }) })
    const r = await handleVerify(d, await body([await clientFrame('scl', 0)]))
    assertEquals(r, { status: 422, body: { error: 'NOT_PINNED' } })
    assertEquals(
      d.calls.filter((c) => c.startsWith('record ')),
      [`record ${INV.id} 1`],
    )
    assertEquals(d.saved, [])
  },
)

Deno.test(
  'prunes the frames of dates that are no longer pinned: after the reads, before the save (E11)',
  async () => {
    const d = deps({ loadInvestigation: async () => ({ ...INV, pinned: ['2025-03-05', '2025-12-20'] }) })
    const r = await handleVerify(d, await body([await clientFrame('scl', 0), await clientFrame('visual', 1)]))
    assertEquals(r.status, 200)
    assertEquals(d.calls, [
      `record ${INV.id} 2`,
      'fetchItem',
      'openCog',
      'openCog',
      `prune ${INV.id} 2025-03-05,2025-12-20 2025-12-20 ${ITEM.id}`,
      'save',
    ])
  },
)

Deno.test('503 when the prune fails, and nothing is saved (never a silent skip)', async () => {
  const d = deps({
    pruneFrames: async () => {
      throw new Error('db down')
    },
  })
  assertEquals(await handleVerify(d, await body([await clientFrame('scl', 0)])), {
    status: 503,
    body: { error: 'UNAVAILABLE' },
  })
  assertEquals(d.saved, [])
  assertEquals(d.calls.includes('save'), false)
})

Deno.test(
  '503 when the investigation cannot be loaded: a query error is not a 404, and nothing is recorded',
  async () => {
    const d = deps({
      loadInvestigation: async () => {
        throw new Error('db down')
      },
    })
    assertEquals(await handleVerify(d, await body([await clientFrame('scl', 0)])), {
      status: 503,
      body: { error: 'UNAVAILABLE' },
    })
    assertEquals(d.calls, [])
  },
)

Deno.test('503 when the frames cannot be written, or fewer rows come back than were sent', async () => {
  const frames = await body([await clientFrame('scl', 0), await clientFrame('visual', 1)])
  const unavailable = { status: 503, body: { error: 'UNAVAILABLE' } }
  const failing = deps({
    saveFrames: async () => {
      throw new Error('db down')
    },
  })
  assertEquals(await handleVerify(failing, frames), unavailable)
  // The attempt was recorded before any read, so the failed write still counted.
  assertEquals(failing.calls.filter((c) => c.startsWith('record ')).length, 1)
  const short = deps({ saveFrames: async (rows) => rows.slice(1).map(() => ({ id: 'f', verified_at: 'x' })) })
  assertEquals(await handleVerify(short, frames), unavailable)
})

Deno.test(
  '422 with the rule code only when the database refuses the write (GS:LIMIT_FRAMES is not retried)',
  async () => {
    const frames = await body([await clientFrame('scl', 0)])
    const refused = (message: string) =>
      deps({
        saveFrames: async () => {
          throw new Error(message)
        },
      })
    assertEquals(await handleVerify(refused('GS:LIMIT_FRAMES'), frames), {
      status: 422,
      body: { error: 'GS:LIMIT_FRAMES' },
    })
    // Whatever else the driver adds around the code (table names, values) is not echoed.
    assertEquals(
      await handleVerify(refused('P0001: GS:LIMIT_FRAMES detail: investigation 1111 has 50 frames'), frames),
      { status: 422, body: { error: 'GS:LIMIT_FRAMES' } },
    )
    assertEquals((await handleVerify(refused('connection reset by peer'), frames)).status, 503)
  },
)

Deno.test(
  '400 for item ids that do not start alphanumeric: `..` would normalise to the collection URL (E14)',
  async () => {
    const f = await clientFrame('scl', 0)
    const status = async (id: string) =>
      (await handleVerify(deps(), await body([f], { item: { collection: 'sentinel-2-l2a', id } }))).status
    for (const id of ['..', '.', '.x', '-x', '_x', 'a/b', 'a'.repeat(101)])
      assertEquals(await status(id), 400, id)
    assertEquals(await status('a'.repeat(100)), 404) // parsed, then simply not found
  },
)

const stac = (visualHref: string) => ({
  id: ITEM.id,
  properties: { datetime: ITEM.datetime, 'proj:epsg': 32644 },
  geometry: { type: 'Polygon', coordinates: ITEM.footprint },
  assets: {
    visual: { href: visualHref, 'proj:transform': TCI_TRANSFORM, 'proj:shape': TCI_SHAPE },
    scl: { href: ITEM.scl.href, 'proj:transform': SCL_TRANSFORM, 'proj:shape': SCL_SHAPE },
  },
})

Deno.test("parseStacItem allows the browser's three hosts and no other *.blob.core.windows.net (E13)", () => {
  for (const host of [
    'sentinel-cogs.s3.us-west-2.amazonaws.com',
    'e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com',
    'sentinel2l2a01.blob.core.windows.net',
  ]) {
    const href = `https://${host}/f/TCI.tif`
    assertEquals(parseStacItem(stac(href), 'sentinel-2-l2a')?.visual.href, href)
  }
  for (const href of [
    'https://evil.blob.core.windows.net/f/TCI.tif',
    'https://sentinel2l2a01.blob.core.windows.net.evil.com/f/TCI.tif',
    'http://sentinel2l2a01.blob.core.windows.net/f/TCI.tif',
  ])
    assertEquals(parseStacItem(stac(href), 'sentinel-2-l2a'), null, href)
})

// The SAME literal is pinned in tests/unit/evidence-determinism.test.ts, which derives it through src/evidence under Node: together they
// prove the function (Deno, the generated copy) derives the same window and bytes as the shared source (spec §11); the three
// browser engines are the Playwright half. Change both or neither.
const PIN = {
  window: [45, 46, 103, 107],
  sha256: 'b16880ae7396f7bce8371dcbaed16245084b8138bfefa5c0940264e01477e8f3',
}

Deno.test('the fixture frame hashes to the pinned value (visual, level 1, Nagpur square)', async () => {
  const f = await clientFrame('visual', 1)
  assertEquals({ window: f.window, sha256: f.sha256 }, PIN)
})

Deno.test(
  'the handler derives the pinned bytes: verified, and server_sha256 is the pinned literal',
  async () => {
    const r = await handleVerify(deps(), await body([await clientFrame('visual', 1)]))
    const out = (r.body as { frames: Array<{ status: string; server_sha256: string }> }).frames[0]!
    assertEquals([out.status, out.server_sha256], ['verified', PIN.sha256])
  },
)

Deno.test('the daily count is taken for the authenticated user', async () => {
  let seen = ''
  await handleVerify(
    deps({
      countRecentFrames: async (u) => {
        seen = u
        return 0
      },
    }),
    await body([await clientFrame('scl', 0)]),
  )
  assertEquals(seen, USER)
})

Deno.test(
  'a failing HEAD is not fatal; the identity is stored as recorded, and the HEAD knows the collection',
  async () => {
    const seen: string[] = []
    const ok = deps({
      headAsset: async (_href, collection) => {
        seen.push(collection)
        return { etag: '"x"' }
      },
    })
    await handleVerify(ok, await body([await clientFrame('scl', 0)]))
    assertEquals((ok.saved[0] as { source_identity: unknown }).source_identity, { etag: '"x"' })
    assertEquals(seen, ['sentinel-2-l2a'])
    for (const failing of [
      async () => {
        throw new Error('HEAD 403')
      },
      // A dependency that throws synchronously must not escape either.
      () => {
        throw new Error('HEAD sync')
      },
    ]) {
      const bad = deps({ headAsset: failing as VerifyDeps['headAsset'] })
      assertEquals((await handleVerify(bad, await body([await clientFrame('scl', 0)]))).status, 200)
      assertEquals((bad.saved[0] as { source_identity: unknown }).source_identity, {})
    }
  },
)

Deno.test('422 NO_OVERLAP when the item footprint does not touch the outline', async () => {
  const far: ItemLite['footprint'] = [
    [
      [10, 10],
      [11, 10],
      [11, 11],
      [10, 11],
      [10, 10],
    ],
  ]
  const r = await handleVerify(
    deps({ fetchItem: async () => ({ ...ITEM, footprint: far }) }),
    await body([await clientFrame('scl', 0)]),
  )
  assertEquals(r, { status: 422, body: { error: 'NO_OVERLAP' } })
})

Deno.test('422 BAD_GEOMETRY before anything is counted', async () => {
  const d = deps({
    loadInvestigation: async () => ({ ...INV, geom_geojson: { type: 'Point', coordinates: [0, 0] } }),
  })
  assertEquals(await handleVerify(d, await body([await clientFrame('scl', 0)])), {
    status: 422,
    body: { error: 'BAD_GEOMETRY' },
  })
  assertEquals(d.calls, [])
})

Deno.test('422 BAD_LEVEL when the file does not have the STAC shape', async () => {
  const wrong = { ...ITEM, scl: { ...ITEM.scl, shape: [256, 256] as [number, number] } }
  const r = await handleVerify(
    deps({ fetchItem: async () => wrong }),
    await body([await clientFrame('scl', 0)]),
  )
  assertEquals(r, { status: 422, body: { error: 'BAD_LEVEL' } })
})

Deno.test('422 DATE_OUTSIDE_RANGE above date_to as well', async () => {
  const r = await handleVerify(
    deps({ fetchItem: async () => ({ ...ITEM, datetime: '2026-01-01T05:30:00Z' }) }),
    await body([await clientFrame('scl', 0)]),
  )
  assertEquals(r, { status: 422, body: { error: 'DATE_OUTSIDE_RANGE' } })
})

Deno.test('502 when the STAC item fetch or the window read fails', async () => {
  const b = await body([await clientFrame('scl', 0)])
  const noItem = deps({
    fetchItem: async () => {
      throw new Error('STAC_503')
    },
  })
  assertEquals(await handleVerify(noItem, b), { status: 502, body: { error: 'UPSTREAM' } })
  const noRead = deps({
    openCog: async () => ({
      sizes: [{ width: 128, height: 128 }],
      read: async () => {
        throw new Error('range failed')
      },
    }),
  })
  assertEquals(await handleVerify(noRead, b), { status: 502, body: { error: 'UPSTREAM' } })
})

Deno.test(
  'an item with a non-allowlisted asset href is refused before any open or HEAD, even if fetchItem returned it',
  async () => {
    for (const href of ['http://169.254.169.254/latest/meta-data', 'https://evil.example/TCI.tif']) {
      const calls: string[] = []
      const d = deps({
        fetchItem: async () => ({ ...ITEM, visual: { ...ITEM.visual, href } }),
        openCog: async () => {
          calls.push('openCog')
          throw new Error('must not be called')
        },
        headAsset: async () => {
          calls.push('headAsset')
          return {}
        },
      })
      assertEquals(await handleVerify(d, await body([await clientFrame('visual', 0)])), {
        status: 404,
        body: { error: 'ITEM_NOT_FOUND' },
      })
      assertEquals(calls, [])
    }
  },
)

Deno.test(
  'a road investigation verifies and returns the whole-line stats with one part per 2 km',
  async () => {
    const road = { kind: 'road' as const, line: FIXTURE_ROAD, widthM: 30 }
    const cog = await openCogBuffer(toArrayBuffer(files[ITEM.scl.href]!))
    const window = aoiPixelWindow(aoiPointsUtm(road, ITEM.epsg), levelInfoFor(ITEM.scl, cog, 0), 2)!.clamped
    const sha256 = await sha256Hex(await cog.read(0, window, [0]))
    const inv = {
      ...INV,
      kind: 'road' as const,
      geom_geojson: { type: 'LineString', coordinates: FIXTURE_ROAD },
      road_width_m: 30,
    }
    const r = await handleVerify(
      deps({ loadInvestigation: async () => inv }),
      await body([{ asset: 'scl', level: 0, window, sha256 }]),
    )
    assertEquals(r.status, 200)
    const f = (
      r.body as {
        frames: Array<{
          status: string
          quality: { label: string; parts: Array<{ idx: number; fromM: number }> }
        }>
      }
    ).frames[0]!
    assertEquals([f.status, f.quality.label], ['verified', 'CLEAR'])
    assertEquals(
      f.quality.parts.map((p) => [p.idx, p.fromM]),
      [
        [0, 0],
        [1, 2000],
      ],
    )
  },
)

Deno.test('the item date is the UTC date, as the browser derives it (an offset timestamp)', async () => {
  // 23:30 at UTC-5 on 20 Dec is 04:30 UTC on 21 Dec: the browser pins the 21st, so the server must too.
  const item = { ...ITEM, datetime: '2025-12-20T23:30:00-05:00' }
  const on21 = deps({
    fetchItem: async () => item,
    loadInvestigation: async () => ({ ...INV, pinned: ['2025-12-21'] }),
  })
  assertEquals((await handleVerify(on21, await body([await clientFrame('scl', 0)]))).status, 200)
  assertEquals((on21.saved[0] as { frame_date: string }).frame_date, '2025-12-21')
  const on20 = deps({ fetchItem: async () => item }) // INV pins the 20th only
  assertEquals((await handleVerify(on20, await body([await clientFrame('scl', 0)]))).status, 422)
})

Deno.test('500 and nothing counted when the loaded row lacks its columns (a loader bug)', async () => {
  const d = deps({ loadInvestigation: async () => ({ ...INV, pinned: undefined as unknown as string[] }) })
  assertEquals(await handleVerify(d, await body([await clientFrame('scl', 0)])), {
    status: 500,
    body: { error: 'INTERNAL' },
  })
  assertEquals(d.calls, [])
})

Deno.test(
  '500 with no detail when something unexpected throws after the record; the attempt still counted',
  async () => {
    const logged: string[] = []
    const d = deps({
      fetchItem: async () => ({ ...ITEM, footprint: null as unknown as ItemLite['footprint'] }),
      log: (step) => {
        logged.push(step)
      },
    })
    assertEquals(await handleVerify(d, await body([await clientFrame('scl', 0)])), {
      status: 500,
      body: { error: 'INTERNAL' },
    })
    assertEquals(d.calls.filter((c) => c.startsWith('record ')).length, 1)
    assertEquals(logged, ['unexpected'])
  },
)

Deno.test(
  'the operator log hears which step failed, and what it hears never reaches the caller',
  async () => {
    const heard: Array<[string, string]> = []
    const d = deps({
      loadInvestigation: async () => {
        throw new Error('connection to db-internal-7 refused')
      },
      log: (step, e) => {
        heard.push([step, (e as Error).message])
      },
    })
    const r = await handleVerify(d, await body([await clientFrame('scl', 0)]))
    assertEquals(heard, [['load', 'connection to db-internal-7 refused']])
    assertEquals(JSON.stringify(r).includes('db-internal-7'), false)
  },
)

Deno.test('parseStacItem returns null instead of throwing on malformed or unsafe items', () => {
  const ok = stac(ITEM.visual.href)
  const parse = (raw: unknown) => parseStacItem(raw, 'sentinel-2-l2a')
  assertEquals(parse({ ...ok, geometry: { type: 'Polygon' } }), null)
  assertEquals(parse({ ...ok, geometry: { type: 'MultiPolygon', coordinates: [] } }), null)
  const withVisual = (v: Record<string, unknown>) => ({
    ...ok,
    assets: { ...ok.assets, visual: { ...ok.assets.visual, ...v } },
  })
  assertEquals(parse(withVisual({ 'proj:transform': [10, 0, 'x', 0, -10, 1] })), null)
  assertEquals(parse(withVisual({ 'proj:shape': [0, 10980] })), null)
  for (const href of [
    'https://user:pw@sentinel-cogs.s3.us-west-2.amazonaws.com/f/TCI.tif',
    'https://sentinel-cogs.s3.us-west-2.amazonaws.com:8443/f/TCI.tif',
  ])
    assertEquals(parse(withVisual({ href })), null, href)
  // What is stored and fetched is the normalised URL that was checked.
  assertEquals(
    parse(withVisual({ href: 'https://SENTINEL-COGS.s3.us-west-2.amazonaws.com/f/TCI.tif' }))?.visual.href,
    'https://sentinel-cogs.s3.us-west-2.amazonaws.com/f/TCI.tif',
  )
})
