import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { newInvestigation, type Investigation } from '../data/investigation.ts'
import {
  deleteAccount,
  deleteRemote,
  listRemote,
  loadRemoteInvestigation,
  recordConsent,
  remoteDeps,
} from './remote.ts'
import { SessionExpiredError, type VerifyBody } from './save.ts'

// The real supabase-js client over a fake fetch: what is asserted is what would go on the wire.
interface Req {
  method: string
  path: string
  query: URLSearchParams
  headers: Headers
  body: unknown
}
type Answer = { status?: number; body?: unknown } | Error
function wire(respond: (r: Req, n: number) => Answer) {
  const log: Req[] = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const r: Req = {
      method: init?.method ?? 'GET',
      path: url.pathname.replace(/^\/supabase/, ''),
      query: url.searchParams,
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    log.push(r)
    const out = respond(r, log.length - 1)
    if (out instanceof Error) throw out
    return new Response(out.body === undefined ? null : JSON.stringify(out.body), {
      status: out.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const sb = createClient('http://127.0.0.1:9/supabase', 'e2e-publishable-key', {
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return { sb, log }
}

const inv = (patch: Partial<Investigation> = {}): Investigation => ({
  ...newInvestigation(
    {
      name: 'Yard',
      aoi: {
        kind: 'site',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [79.08, 21.14],
              [79.09, 21.14],
              [79.09, 21.15],
              [79.08, 21.14],
            ],
          ],
        },
      },
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
    },
    new Date('2026-10-05T10:00:00Z'),
    '00000000-0000-4000-8000-000000000001',
  ),
  ...patch,
})
const note = (id: string) => ({
  id,
  kind: 'unsure' as const,
  body: `note ${id}`,
  date: null,
  sectionIdx: null,
  createdAt: '2026-10-05T10:00:00.000Z',
  updatedAt: '2026-10-05T10:00:00.000Z',
})
const JWT_EXPIRED = { status: 401, body: { code: 'PGRST301', message: 'JWT expired' } }
const caught = async (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  )

describe('saveInvestigation', () => {
  it('inserts a new investigation with its geometry and asks for the id back, naming no owner', async () => {
    const { sb, log } = wire(() => ({ status: 201, body: { id: 'srv-1' } }))
    expect(await remoteDeps(sb).saveInvestigation(inv())).toBe('srv-1')
    expect(log).toHaveLength(1)
    const r = log[0]!
    expect([r.method, r.path]).toEqual(['POST', '/rest/v1/investigations'])
    expect(r.headers.get('apikey')).toBe('e2e-publishable-key')
    expect(r.headers.get('prefer')).toContain('return=representation')
    expect(r.body).toMatchObject({
      name: 'Yard',
      kind: 'site',
      geom: 'SRID=4326;POLYGON((79.08 21.14,79.09 21.14,79.09 21.15,79.08 21.14))',
      date_from: '2025-01-01',
      date_to: '2025-12-31',
    })
    expect(Object.keys(r.body as object)).not.toContain('owner')
  })

  it('updates the saved row with only the columns that can change, and returns its id', async () => {
    const { sb, log } = wire(() => ({ body: [{ id: 'srv-9' }] }))
    expect(await remoteDeps(sb).saveInvestigation(inv({ serverId: 'srv-9' }))).toBe('srv-9')
    expect(log).toHaveLength(1)
    expect([log[0]!.method, log[0]!.path, log[0]!.query.get('id')]).toEqual([
      'PATCH',
      '/rest/v1/investigations',
      'eq.srv-9',
    ])
    expect(Object.keys(log[0]!.body as object).sort()).toEqual(
      ['after_date', 'before_date', 'claim_criterion', 'claim_date', 'claim_text', 'name', 'pinned'].sort(),
    )
  })

  it('saves it again as a new row when the saved one is gone (deleted on another device)', async () => {
    const { sb, log } = wire((r) =>
      r.method === 'PATCH' ? { body: [] } : { status: 201, body: { id: 'srv-2' } },
    )
    expect(await remoteDeps(sb).saveInvestigation(inv({ serverId: 'srv-gone' }))).toBe('srv-2')
    expect(log.map((r) => r.method)).toEqual(['PATCH', 'POST'])
  })

  it('maps a rejected session to SessionExpiredError and any other refusal to its message (E8)', async () => {
    for (const answer of [
      JWT_EXPIRED,
      { status: 401, body: { message: 'anything' } },
      { status: 400, body: { code: 'PGRST303', message: 'JWT issuer claim' } },
    ]) {
      const { sb } = wire(() => answer)
      expect(await caught(remoteDeps(sb).saveInvestigation(inv())), JSON.stringify(answer)).toBeInstanceOf(
        SessionExpiredError,
      )
    }
    const { sb } = wire(() => ({ status: 400, body: { code: 'P0001', message: 'GS:TOO_LARGE' } }))
    const e = await caught(remoteDeps(sb).saveInvestigation(inv()))
    expect(e).toBeInstanceOf(Error)
    expect(e).not.toBeInstanceOf(SessionExpiredError)
    expect((e as Error).message).toBe('GS:TOO_LARGE')
  })
})

describe('replaceNotes (E18)', () => {
  const ok = (): Answer => ({ status: 204 })

  it('deletes the notes the copy knew and no longer has, then upserts the rest by investigation and id', async () => {
    const { sb, log } = wire(ok)
    await remoteDeps(sb).replaceNotes('srv-1', [note('a'), note('b')], ['a', 'b', 'c'])
    // delete first, so a swap at the 200-note cap fits
    expect(log.map((r) => `${r.method} ${r.path}`)).toEqual([
      'DELETE /rest/v1/annotations',
      'POST /rest/v1/annotations',
    ])
    expect(log[0]!.query.get('investigation_id')).toBe('eq.srv-1')
    expect(log[0]!.query.get('id')).toBe('in.(c)')
    expect(log[1]!.query.get('on_conflict')).toBe('investigation_id,id')
    expect(log[1]!.headers.get('prefer')).toContain('resolution=merge-duplicates')
    expect(
      (log[1]!.body as Array<{ id: string; investigation_id: string }>).map((n) => [
        n.id,
        n.investigation_id,
      ]),
    ).toEqual([
      ['a', 'srv-1'],
      ['b', 'srv-1'],
    ])
  })

  it('never deletes a note the copy did not know: one written on another device stays', async () => {
    const { sb, log } = wire(ok)
    // the server may hold a, b and x; this copy last synced a and b and now has only a
    await remoteDeps(sb).replaceNotes('srv-1', [note('a'), note('n')], ['a', 'b'])
    const del = log.filter((r) => r.method === 'DELETE')
    expect(del.map((r) => r.query.get('id'))).toEqual(['in.(b)'])
    // and nothing is read to decide it
    expect(log.some((r) => r.method === 'GET')).toBe(false)
  })

  it('a first save (nothing known) deletes nothing', async () => {
    const { sb, log } = wire(ok)
    await remoteDeps(sb).replaceNotes('srv-1', [note('a')])
    expect(log.map((r) => r.method)).toEqual(['POST'])
  })

  it('deletes every known note for an empty list, and never upserts nothing', async () => {
    const { sb, log } = wire(ok)
    await remoteDeps(sb).replaceNotes('srv-1', [], ['a', 'b'])
    expect(log.map((r) => r.method)).toEqual(['DELETE'])
    expect(log[0]!.query.get('id')).toBe('in.(a,b)')
  })

  it('deletes in chunks of 50 ids, so the request line stays short at the 200-note cap', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `n${i}`)
    const { sb, log } = wire(ok)
    await remoteDeps(sb).replaceNotes('srv-1', [], ids)
    expect(log.filter((r) => r.method === 'DELETE').map((r) => r.query.get('id')!.split(',').length)).toEqual(
      [50, 50, 20],
    )
  })

  it('a refused delete stops before the upsert; a refused upsert reports its message', async () => {
    const refusedDelete = wire((r) =>
      r.method === 'DELETE' ? { status: 400, body: { message: 'nope' } } : { status: 204 },
    )
    await expect(remoteDeps(refusedDelete.sb).replaceNotes('srv-1', [note('a')], ['b'])).rejects.toThrow(
      'nope',
    )
    expect(refusedDelete.log.map((r) => r.method)).toEqual(['DELETE'])
    const refusedUpsert = wire((r) =>
      r.method === 'POST' ? { status: 400, body: { message: 'GS:LIMIT_NOTES' } } : { status: 204 },
    )
    await expect(remoteDeps(refusedUpsert.sb).replaceNotes('srv-1', [note('a')], [])).rejects.toThrow(
      'GS:LIMIT_NOTES',
    )
  })

  it('maps a rejected session on any step to SessionExpiredError', async () => {
    for (const method of ['DELETE', 'POST']) {
      const { sb } = wire((r) => (r.method === method ? JWT_EXPIRED : { status: 204 }))
      expect(await caught(remoteDeps(sb).replaceNotes('srv-1', [note('a')], ['b']))).toBeInstanceOf(
        SessionExpiredError,
      )
    }
  })
})

describe('verify', () => {
  const body: VerifyBody = {
    investigation_id: 'srv-1',
    item: { collection: 'sentinel-2-l2a', id: 'S2_A' },
    frames: [{ asset: 'scl', level: 0, window: [1, 2, 3, 4], sha256: 'a'.repeat(64) }],
  }
  const frame = {
    asset: 'scl',
    level: 0,
    status: 'verified',
    server_sha256: 'a'.repeat(64),
    frame_id: 'f1',
    verified_at: '2026-10-05T10:00:00Z',
    quality: null,
  }

  it('posts the body to the verify function and returns its frames', async () => {
    const { sb, log } = wire(() => ({ body: { frames: [frame] } }))
    expect(await remoteDeps(sb).verify(body)).toEqual({ ok: true, frames: [frame] })
    expect([log[0]!.method, log[0]!.path]).toEqual(['POST', '/functions/v1/verify'])
    expect(log[0]!.body).toEqual(body)
    expect(log[0]!.headers.get('apikey')).toBe('e2e-publishable-key')
  })

  it("returns the function's own status and code, the handler's contract", async () => {
    for (const [status, error] of [
      [422, 'GS:LIMIT_FRAMES'],
      [429, 'RATE_LIMITED'],
      [502, 'UPSTREAM'],
      [404, 'INVESTIGATION_NOT_FOUND'],
    ] as const) {
      const { sb } = wire(() => ({ status, body: { error } }))
      expect(await remoteDeps(sb).verify(body)).toEqual({ ok: false, status, error })
    }
  })

  it('reports a gateway 401 (no error field) as status 401, a dropped connection as a retryable 502', async () => {
    const gateway = wire(() => ({ status: 401, body: { code: 401, message: 'Invalid JWT' } }))
    expect(await remoteDeps(gateway.sb).verify(body)).toEqual({ ok: false, status: 401, error: 'UNKNOWN' })
    const down = wire(() => new TypeError('Failed to fetch'))
    expect(await remoteDeps(down.sb).verify(body)).toEqual({ ok: false, status: 502, error: 'NETWORK' })
  })

  it('does not trust a 200 without frames', async () => {
    const { sb } = wire(() => ({ body: {} }))
    expect(await remoteDeps(sb).verify(body)).toEqual({ ok: false, status: 502, error: 'BAD_RESPONSE' })
  })
})

describe('account calls', () => {
  it('recordConsent calls the record_consent RPC and throws when it fails (E9)', async () => {
    const ok = wire(() => ({ status: 204 }))
    await recordConsent('v1', ok.sb)
    expect([ok.log[0]!.method, ok.log[0]!.path, ok.log[0]!.body]).toEqual([
      'POST',
      '/rest/v1/rpc/record_consent',
      { version: 'v1' },
    ])
    const bad = wire(() => ({ status: 400, body: { code: 'P0001', message: 'GS:NOT_SIGNED_IN' } }))
    await expect(recordConsent('v1', bad.sb)).rejects.toThrow('GS:NOT_SIGNED_IN')
    const expired = wire(() => JWT_EXPIRED)
    expect(await caught(recordConsent('v1', expired.sb))).toBeInstanceOf(SessionExpiredError)
  })

  it('deleteAccount calls delete-account and throws DELETE_FAILED when the function fails', async () => {
    const ok = wire(() => ({ body: { ok: true } }))
    await deleteAccount(ok.sb)
    expect([ok.log[0]!.method, ok.log[0]!.path]).toEqual(['POST', '/functions/v1/delete-account'])
    const bad = wire(() => ({ status: 500, body: { error: 'DELETE_FAILED' } }))
    await expect(deleteAccount(bad.sb)).rejects.toThrow('DELETE_FAILED')
  })

  it('deleteRemote deletes one investigation by id and throws when refused', async () => {
    const ok = wire(() => ({ status: 204 }))
    await deleteRemote('srv-1', ok.sb)
    expect([ok.log[0]!.method, ok.log[0]!.path, ok.log[0]!.query.get('id')]).toEqual([
      'DELETE',
      '/rest/v1/investigations',
      'eq.srv-1',
    ])
    const bad = wire(() => ({ status: 400, body: { message: 'nope' } }))
    await expect(deleteRemote('srv-1', bad.sb)).rejects.toThrow('nope')
  })

  it('listRemote lists the newest first and throws on an error rather than showing an empty list', async () => {
    const rows = [{ id: 'a', name: 'A', updated_at: '2026-10-02T00:00:00Z' }]
    const ok = wire(() => ({ body: rows }))
    expect(await listRemote(ok.sb)).toEqual(rows)
    expect(ok.log[0]!.query.get('order')).toBe('updated_at.desc')
    const bad = wire(() => ({ status: 500, body: { message: 'down' } }))
    await expect(listRemote(bad.sb)).rejects.toThrow('down')
  })
})

describe('loadRemoteInvestigation', () => {
  const row = {
    id: 'srv-1',
    name: 'Server yard',
    kind: 'site',
    geom_geojson: {
      type: 'Polygon',
      coordinates: [
        [
          [79.08, 21.14],
          [79.09, 21.14],
          [79.09, 21.15],
          [79.08, 21.14],
        ],
      ],
    },
    road_width_m: null,
    date_from: '2025-01-01',
    date_to: '2025-12-31',
    before_date: null,
    after_date: null,
    pinned: [],
    claim_text: null,
    claim_date: null,
    claim_criterion: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
  }
  const respond =
    (over: Partial<Record<'investigations' | 'annotations' | 'frames', Answer>> = {}) =>
    (r: Req): Answer => {
      const table = r.path.split('/').pop() as 'investigations' | 'annotations' | 'frames'
      return (
        over[table] ?? {
          body:
            table === 'investigations'
              ? [row]
              : table === 'annotations'
                ? [
                    {
                      id: 'n1',
                      kind: 'unsure',
                      body: 'x',
                      frame_date: null,
                      section_idx: null,
                      created_at: 'c',
                      updated_at: 'u',
                    },
                  ]
                : [],
        }
      )
    }

  it('reads the row, its notes and its frames with the account key and returns the investigation', async () => {
    const { sb, log } = wire(respond())
    const got = await loadRemoteInvestigation('srv-1', sb)
    expect(got).toMatchObject({ id: 'srv-1', serverId: 'srv-1', name: 'Server yard' })
    expect(got!.notes).toHaveLength(1)
    expect(log.map((r) => r.path).sort()).toEqual([
      '/rest/v1/annotations',
      '/rest/v1/frames',
      '/rest/v1/investigations',
    ])
    expect(log.find((r) => r.path.endsWith('/investigations'))!.query.get('select')).toContain('geom_geojson')
  })

  it('is null for an investigation the account does not hold (RLS shows no row)', async () => {
    const { sb } = wire(respond({ investigations: { body: [] } }))
    expect(await loadRemoteInvestigation('srv-x', sb)).toBeNull()
  })

  it('throws, rather than open an investigation without its notes, when a read fails', async () => {
    for (const over of [
      { annotations: { status: 500, body: { message: 'down' } } },
      { frames: { status: 500, body: { message: 'down' } } },
      { investigations: { status: 500, body: { message: 'down' } } },
    ]) {
      const { sb } = wire(respond(over))
      await expect(loadRemoteInvestigation('srv-1', sb), JSON.stringify(over)).rejects.toThrow('down')
    }
  })
})
