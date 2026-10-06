import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './index.ts'

const SATS = JSON.parse(
  readFileSync(new URL('../tests/fixtures/tle.json', import.meta.url), 'utf8'),
) as unknown[]
const ASSETS = { fetch: vi.fn(async () => new Response('<!doctype html>')) }

afterEach(() => {
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
    const res = await worker.fetch(new Request('https://app.example/api/tle'), { ASSETS })
    expect(res.status).toBe(200)
    expect(store.size).toBe(1)
  })
  it('keeps the 2 h window when caches.default does nothing (workers.dev)', async () => {
    vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {} } })
    const up = vi.fn(async () => new Response(JSON.stringify(SATS)))
    vi.stubGlobal('fetch', up)
    for (let i = 0; i < 2; i++) {
      const res = await worker.fetch(new Request('https://noop.example/api/tle'), { ASSETS })
      expect(res.status).toBe(200)
    }
    expect(up).toHaveBeenCalledOnce()
  })
  it('falls back to the bundled snapshot when CelesTrak is down and nothing is cached', async () => {
    vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {} } })
    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }))
    const snap = { fetch: vi.fn(async () => new Response(JSON.stringify(SATS))) }
    const res = await worker.fetch(new Request('https://down.example/api/tle'), { ASSETS: snap })
    expect(res.status).toBe(200)
    expect(res.headers.get('x-gs-stale')).toBe('1')
    expect(await res.json()).toEqual(SATS)
  })
  it('hands every other path to the assets binding', async () => {
    const res = await worker.fetch(new Request('https://app.example/new'), { ASSETS })
    expect(await res.text()).toBe('<!doctype html>')
    expect(ASSETS.fetch).toHaveBeenCalledOnce()
  })
})
