import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './index.ts'

const SATS = JSON.parse(
  readFileSync(new URL('../tests/fixtures/tle.json', import.meta.url), 'utf8'),
) as unknown[]
const ASSETS = { fetch: vi.fn(async () => new Response('<!doctype html>')) }
const ctx = { waitUntil: vi.fn() }

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('worker entry', () => {
  it('serves /api/tle with a receiver-free fetch and caches.default', async () => {
    const store = new Map<string, Response>()
    vi.stubGlobal('caches', {
      default: {
        match: async (r: Request) => store.get(r.url)?.clone(),
        put: async (r: Request, res: Response) => void store.set(r.url, res.clone()),
      },
    })
    // workerd throws "Illegal invocation" if fetch is called as obj.fetch() (any receiver but the global).
    vi.stubGlobal('fetch', function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation')
      return Promise.resolve(new Response(JSON.stringify(SATS)))
    })
    const res = await worker.fetch(new Request('https://app.example/api/tle'), { ASSETS }, ctx)
    expect(res.status).toBe(200)
    expect(store.size).toBe(1)
  })
  it('falls back to the bundled snapshot when CelesTrak is down and nothing is cached', async () => {
    vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {} } })
    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }))
    const snap = { fetch: vi.fn(async () => new Response(JSON.stringify(SATS))) }
    const res = await worker.fetch(new Request('https://down.example/api/tle'), { ASSETS: snap }, ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get('x-gs-stale')).toBe('1')
    expect(await res.json()).toEqual(SATS)
  })
  it('answers from the snapshot after 0.8 s when the refresh is slow, and lets the refresh finish in the background', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {} } })
    vi.stubGlobal('fetch', () => new Promise(() => {})) // CelesTrak never answers
    const snap = { fetch: vi.fn(async () => new Response(JSON.stringify(SATS))) }
    const pending = worker.fetch(new Request('https://slow.example/api/tle'), { ASSETS: snap }, ctx)
    await vi.advanceTimersByTimeAsync(799)
    expect(snap.fetch).not.toHaveBeenCalled() // still inside the deadline
    await vi.advanceTimersByTimeAsync(2)
    const res = await pending
    expect(res.status).toBe(200)
    expect(res.headers.get('x-gs-stale')).toBe('1')
    expect(await res.json()).toEqual(SATS)
    expect(ctx.waitUntil).toHaveBeenCalledOnce()
  })
  it('does not hand a fast answer to waitUntil', async () => {
    vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {} } })
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(SATS)))
    const res = await worker.fetch(new Request('https://fast.example/api/tle'), { ASSETS }, ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get('x-gs-stale')).toBeNull()
    expect(ctx.waitUntil).not.toHaveBeenCalled()
  })
  it('answers unknown /api paths with a JSON 404, not the app shell', async () => {
    for (const path of ['/api/anything', '/api/', '/api/tle/x']) {
      const res = await worker.fetch(new Request(`https://app.example${path}`), { ASSETS }, ctx)
      expect(res.status, path).toBe(404)
      expect(res.headers.get('content-type')).toContain('application/json')
      expect(await res.json()).toEqual({ error: 'NOT_FOUND' })
    }
    expect(ASSETS.fetch).not.toHaveBeenCalled()
  })
  it('allows only GET and HEAD on /api/tle', async () => {
    vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {} } })
    const up = vi.fn(async () => new Response(JSON.stringify(SATS)))
    vi.stubGlobal('fetch', up)
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const res = await worker.fetch(new Request('https://app.example/api/tle', { method }), { ASSETS }, ctx)
      expect(res.status, method).toBe(405)
      expect(res.headers.get('allow')).toBe('GET, HEAD')
      expect(await res.json()).toEqual({ error: 'METHOD_NOT_ALLOWED' })
    }
    expect(up).not.toHaveBeenCalled()
    for (const method of ['GET', 'HEAD']) {
      const res = await worker.fetch(new Request('https://app.example/api/tle', { method }), { ASSETS }, ctx)
      expect(res.status, method).toBe(200)
    }
  })
  it('hands every other path to the assets binding', async () => {
    const res = await worker.fetch(new Request('https://app.example/new'), { ASSETS }, ctx)
    expect(await res.text()).toBe('<!doctype html>')
    expect(ASSETS.fetch).toHaveBeenCalledOnce()
  })
})
