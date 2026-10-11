import { createClient } from '@supabase/supabase-js'
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { dbDeps } from './db.ts'
import type { FrameRow } from './handler.ts'

const UID = '00000000-0000-4000-8000-00000000000a'
const INV = '11111111-1111-4111-8111-111111111111'
const DAY_MS = 86_400_000

interface Seen {
  method: string
  url: URL
  prefer: string | null
  auth: string | null
  body: unknown
}
/** A real supabase-js client whose only transport is `answer`; `seen` is what PostgREST would receive. */
function client(key: string, answer: (s: Seen) => Response) {
  const seen: Seen[] = []
  const fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const h = new Headers(init.headers)
    const s: Seen = {
      method: init.method ?? 'GET',
      url: new URL(String(input)),
      prefer: h.get('prefer'),
      auth: h.get('authorization'),
      body: init.body ? JSON.parse(String(init.body)) : null,
    }
    seen.push(s)
    return answer(s)
  }) as typeof globalThis.fetch
  const c = createClient('https://abcdefghijklmnopqrst.supabase.co', key, {
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return { c, seen }
}
const boom = () =>
  Response.json({ code: 'XX000', message: 'boom', details: null, hint: null }, { status: 500 })
const idle = client('anon', () => new Response('[]')).c
const deps = (asUser = idle, admin = idle) => dbDeps(UID, asUser, admin)

Deno.test(
  "countRecentFrames: this user's check rows of the last 24 h, exact; an error or a missing count throws, never 0",
  async () => {
    const ok = client(
      'service',
      () => new Response(null, { status: 200, headers: { 'content-range': '*/7' } }),
    )
    const t = Date.now()
    assertEquals(await deps(idle, ok.c).countRecentFrames(UID), 7)
    const s = ok.seen[0]!
    assertEquals([s.method, s.prefer, s.url.pathname], ['HEAD', 'count=exact', '/rest/v1/audit_log'])
    const q = s.url.searchParams
    assertEquals([q.get('actor'), q.get('action'), q.get('entity')], [`eq.${UID}`, 'eq.check', 'eq.frames'])
    assert(Math.abs(Date.parse(q.get('at')!.replace('gte.', '')) - (t - DAY_MS)) < 5_000)
    assertEquals(s.auth, 'Bearer service')
    await assertRejects(() => deps(idle, client('service', boom).c).countRecentFrames(UID), Error, 'boom')
    const noCount = client('service', () => new Response(null, { status: 200 })).c
    await assertRejects(() => deps(idle, noCount).countRecentFrames(UID), Error, 'COUNT_MISSING')
  },
)

Deno.test(
  'recordChecks: one insert of n check rows (IDs only) for this caller; an error throws',
  async () => {
    const ok = client('service', () => new Response(null, { status: 201 }))
    await deps(idle, ok.c).recordChecks(INV, 3)
    assertEquals(ok.seen.length, 1)
    assertEquals([ok.seen[0]!.method, ok.seen[0]!.url.pathname], ['POST', '/rest/v1/audit_log'])
    assertEquals(
      ok.seen[0]!.body,
      [0, 1, 2].map(() => ({ actor: UID, action: 'check', entity: 'frames', entity_id: INV })),
    )
    await assertRejects(() => deps(idle, client('service', boom).c).recordChecks(INV, 1), Error, 'boom')
  },
)

Deno.test(
  'pruneFrames: this investigation only; unpinned dates and the superseded item of the current date; an error throws',
  async () => {
    const current = { date: '2025-12-20', itemId: 'S2B_44QKJ_20251220_0_L2A' }
    const ok = client('service', () => new Response(null, { status: 200 }))
    await deps(idle, ok.c).pruneFrames(INV, ['2025-12-20', '2026-01-05'], current)
    const s = ok.seen[0]!
    assertEquals([s.method, s.url.pathname], ['DELETE', '/rest/v1/frames'])
    assertEquals(s.url.searchParams.get('investigation_id'), `eq.${INV}`)
    assertEquals(
      s.url.searchParams.get('or'),
      '(frame_date.not.in.(2025-12-20,2026-01-05),and(frame_date.eq.2025-12-20,item_id.neq.S2B_44QKJ_20251220_0_L2A))',
    )
    // nothing pinned: every frame of the investigation, still bounded by the investigation id
    const all = client('service', () => new Response(null, { status: 200 }))
    await deps(idle, all.c).pruneFrames(INV, [], current)
    assertEquals(all.seen[0]!.url.searchParams.get('investigation_id'), `eq.${INV}`)
    assertEquals(all.seen[0]!.url.searchParams.get('or'), null)
    await assertRejects(
      () => deps(idle, client('service', boom).c).pruneFrames(INV, ['2025-12-20'], current),
      Error,
      'boom',
    )
  },
)

const row = (asset: 'visual' | 'scl', level: 0 | 1) =>
  ({
    investigation_id: INV,
    owner: UID,
    item_id: 'X',
    asset,
    level,
    win: [0, 0, 1, 1],
    quality: null,
  }) as unknown as FrameRow

Deno.test(
  'saveFrames: one upsert on the table key; answered in input order; a short answer or a rule refusal throws',
  async () => {
    const rows = [row('scl', 0), row('visual', 0), row('visual', 1)]
    const shuffled = [
      { id: 'c', verified_at: 'T', asset: 'visual', level: 1 },
      { id: 'a', verified_at: 'T', asset: 'scl', level: 0 },
      { id: 'b', verified_at: 'T', asset: 'visual', level: 0 },
    ]
    const ok = client('service', () => Response.json(shuffled, { status: 201 }))
    assertEquals(
      (await deps(idle, ok.c).saveFrames(rows)).map((r) => r.id),
      ['a', 'b', 'c'],
    )
    assertEquals(ok.seen.length, 1)
    const s = ok.seen[0]!
    assertEquals(s.url.searchParams.get('on_conflict'), 'investigation_id,item_id,asset,level')
    assertEquals(s.prefer, 'resolution=merge-duplicates, return=representation')
    const sent = s.body as Array<{ asset: string; level: number; verified_at: string }>
    assertEquals(
      sent.map((r) => `${r.asset}:${r.level}`),
      ['scl:0', 'visual:0', 'visual:1'],
    )
    assertEquals(new Set(sent.map((r) => r.verified_at)).size, 1)
    assert(!Number.isNaN(Date.parse(sent[0]!.verified_at)))

    const short = client('service', () => Response.json(shuffled.slice(0, 2), { status: 201 })).c
    await assertRejects(() => deps(idle, short).saveFrames(rows), Error, 'SHORT_WRITE')

    const cap = client('service', () =>
      Response.json(
        { code: 'P0001', message: 'GS:LIMIT_FRAMES', details: null, hint: null },
        { status: 400 },
      ),
    ).c
    const e = await deps(idle, cap)
      .saveFrames(rows)
      .catch((x) => x)
    assert(e instanceof Error) // the handler maps only an Error carrying the GS: code to 422
    assertEquals(e.message, 'GS:LIMIT_FRAMES')
  },
)

Deno.test(
  'loadInvestigation: as the caller, the columns the handler needs, null only for no row, a query error throws',
  async () => {
    const inv = {
      id: INV,
      owner: UID,
      kind: 'site' as const,
      geom_geojson: { type: 'Polygon', coordinates: [] },
      road_width_m: null,
      date_from: '2026-01-01',
      date_to: '2026-05-31',
      pinned: ['2026-05-12'],
    }
    const found = client('anon', () => Response.json([inv]))
    assertEquals(await deps(found.c, idle).loadInvestigation(INV), inv)
    const s = found.seen[0]!
    assertEquals(s.url.searchParams.get('id'), `eq.${INV}`)
    assertEquals(
      s.url.searchParams.get('select'),
      'id,owner,kind,geom_geojson,road_width_m,date_from,date_to,pinned',
    )
    assertEquals(s.auth, 'Bearer anon')
    assertEquals(await deps(client('anon', () => Response.json([])).c, idle).loadInvestigation(INV), null)
    await assertRejects(() => deps(client('anon', boom).c, idle).loadInvestigation(INV), Error, 'boom')
  },
)
