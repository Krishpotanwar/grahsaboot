import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { handleTle, SAT_IDS, UPSTREAM, type TleCache } from './tle.ts'

const SATS = JSON.parse(
  readFileSync(new URL('../tests/fixtures/tle.json', import.meta.url), 'utf8'),
) as Array<{ NORAD_CAT_ID: number }>
const NOISE = [{ OBJECT_NAME: 'OTHER', NORAD_CAT_ID: 1 }]
const memCache = (): TleCache => {
  const m = new Map<string, Response>()
  return {
    match: async (r) => m.get(r.url)?.clone(),
    put: async (r, res) => {
      m.set(r.url, res.clone())
    },
  }
}
const REQ = new Request('https://app.example/api/tle')

describe('handleTle', () => {
  it('fetches upstream once and returns only our five satellites', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify([...NOISE, ...SATS])))
    const res = await handleTle(REQ, { fetch: fetchImpl, cache: memCache(), now: () => 0 })
    const body = (await res.json()) as Array<{ NORAD_CAT_ID: number }>
    expect(body.map((o) => o.NORAD_CAT_ID).sort()).toEqual([...SAT_IDS].sort())
    expect(res.headers.get('content-type')).toContain('application/json')
    // Privacy contract: the one upstream call carries this User-Agent and nothing else.
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(UPSTREAM, {
      headers: { 'user-agent': 'GrahSaboot/1.0' },
    })
  })
  it('still returns fresh data when the cache write fails', async () => {
    const cache: TleCache = { match: async () => undefined, put: async () => Promise.reject(new Error('nope')) }
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(SATS)))
    const res = await handleTle(REQ, { fetch: fetchImpl, cache, now: () => 0 })
    expect(res.status).toBe(200)
  })
  it('serves from cache for 2 hours, then refreshes', async () => {
    const cache = memCache()
    const fetchImpl = vi.fn().mockImplementation(async () => new Response(JSON.stringify(SATS)))
    await handleTle(REQ, { fetch: fetchImpl, cache, now: () => 0 })
    await handleTle(REQ, { fetch: fetchImpl, cache, now: () => 7_199_000 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await handleTle(REQ, { fetch: fetchImpl, cache, now: () => 7_201_000 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
  it('serves stale data when upstream fails, 503 when nothing is cached', async () => {
    const cache = memCache()
    await handleTle(REQ, {
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(SATS))),
      cache,
      now: () => 0,
    })
    const stale = await handleTle(REQ, {
      fetch: vi.fn().mockResolvedValue(new Response('', { status: 502 })),
      cache,
      now: () => 9e9,
    })
    expect(stale.status).toBe(200)
    expect(stale.headers.get('x-gs-stale')).toBe('1')
    const none = await handleTle(REQ, {
      fetch: vi.fn().mockRejectedValue(new Error('down')),
      cache: memCache(),
      now: () => 0,
    })
    expect(none.status).toBe(503)
  })
  it('treats an upstream list without our satellites as a failure', async () => {
    const res = await handleTle(REQ, {
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(NOISE))),
      cache: memCache(),
      now: () => 0,
    })
    expect(res.status).toBe(503)
  })
  it('backs off for 15 minutes after a failure instead of asking upstream again', async () => {
    const cache = memCache()
    const down = vi.fn().mockImplementation(async () => new Response('', { status: 502 }))
    const first = await handleTle(REQ, { fetch: down, cache, now: () => 0 })
    const second = await handleTle(REQ, { fetch: down, cache, now: () => 899_000 })
    expect([first.status, second.status]).toEqual([503, 503])
    expect(down).toHaveBeenCalledTimes(1)
    await handleTle(REQ, { fetch: down, cache, now: () => 901_000 })
    expect(down).toHaveBeenCalledTimes(2)
  })
  it('keeps serving the last good body, marked stale, while backing off, then recovers', async () => {
    const cache = memCache()
    const up = () => vi.fn().mockImplementation(async () => new Response(JSON.stringify(SATS)))
    await handleTle(REQ, { fetch: up(), cache, now: () => 0 })
    const down = vi.fn().mockImplementation(async () => new Response('', { status: 502 }))
    const t = 3 * 3_600_000
    const first = await handleTle(REQ, { fetch: down, cache, now: () => t })
    const second = await handleTle(REQ, { fetch: down, cache, now: () => t + 899_000 })
    expect(down).toHaveBeenCalledTimes(1)
    for (const r of [first, second]) {
      expect(r.status).toBe(200)
      expect(r.headers.get('x-gs-stale')).toBe('1')
    }
    expect(await second.json()).toEqual(SATS)
    const back = await handleTle(REQ, { fetch: up(), cache, now: () => t + 901_000 })
    expect(back.status).toBe(200)
    expect(back.headers.get('x-gs-stale')).toBeNull()
  })
})
