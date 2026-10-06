import { describe, expect, it, vi } from 'vitest'
import { searchSentinel2 } from './search.ts'

const item = (id: string, date: string) => ({
  id,
  collection: 'sentinel-2-l2a',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [78, 20],
        [80, 20],
        [80, 22],
        [78, 22],
        [78, 20],
      ],
    ],
  },
  properties: { 'proj:epsg': 32644, datetime: `${date}T05:30:00Z` },
  assets: {
    visual: {
      href: `https://sentinel-cogs.s3.us-west-2.amazonaws.com/${id}/TCI.tif`,
      'proj:shape': [10980, 10980],
      'proj:transform': [10, 0, 199980, 0, -10, 2400000],
    },
    scl: {
      href: `https://sentinel-cogs.s3.us-west-2.amazonaws.com/${id}/SCL.tif`,
      'proj:shape': [5490, 5490],
      'proj:transform': [20, 0, 199980, 0, -20, 2400000],
    },
  },
})
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const args = {
  bbox: [79, 21.1, 79.1, 21.2] as [number, number, number, number],
  from: '2025-01-01',
  to: '2025-12-31',
  sleep: async () => {},
}

const pcItem = (id: string, date: string) => {
  const it = item(id, date)
  return {
    ...it,
    assets: {
      visual: { ...it.assets.visual, href: `https://sentinel2l2a01.blob.core.windows.net/${id}/TCI.tif` },
      scl: { ...it.assets.scl, href: `https://sentinel2l2a01.blob.core.windows.net/${id}/SCL.tif` },
    },
  }
}
// Like fetch against a dead server: never answers, rejects with the signal's reason once aborted.
const stall = (init: RequestInit) =>
  new Promise<Response>((_, reject) => {
    const s = init.signal!
    if (s.aborted) reject(s.reason)
    else s.addEventListener('abort', () => reject(s.reason), { once: true })
  })

describe('searchSentinel2', () => {
  it('follows POST next links with their body', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          features: [item('A', '2025-01-01')],
          links: [
            {
              rel: 'next',
              method: 'POST',
              href: 'https://earth-search.aws.element84.com/v1/search',
              body: { next: 'tok' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(json({ features: [item('B', '2025-01-06')], links: [] }))
    const r = await searchSentinel2({ ...args, fetchImpl })
    expect(r.items.map((i) => i.id)).toEqual(['A', 'B'])
    expect(r.limited).toBe(false)
    expect(JSON.parse(fetchImpl.mock.calls[1]![1].body)).toEqual({ next: 'tok' })
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body).bbox).toEqual([79, 21.1, 79.1, 21.2])
  })
  it('stops at maxPages and reports limited', async () => {
    const page = () =>
      json({
        features: [item('X', '2025-02-01')],
        links: [
          { rel: 'next', method: 'POST', href: 'https://earth-search.aws.element84.com/v1/search', body: {} },
        ],
      })
    const fetchImpl = vi.fn().mockImplementation(async () => page())
    const r = await searchSentinel2({ ...args, fetchImpl, maxPages: 2 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(r.limited).toBe(true)
  })
  it('retries a 503 then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ features: [item('A', '2025-01-01')], links: [] }))
    const r = await searchSentinel2({ ...args, fetchImpl })
    expect(r.source).toBe('sentinel-2-l2a')
    expect(r.items).toHaveLength(1)
  })
  it('falls back to Planetary Computer after 3 failures', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) =>
      url.includes('planetarycomputer')
        ? json({
            features: [
              {
                ...item('P', '2025-03-01'),
                assets: {
                  ...item('P', '2025-03-01').assets,
                  visual: {
                    ...item('P', '2025-03-01').assets.visual,
                    href: 'https://sentinel2l2a01.blob.core.windows.net/P/TCI.tif',
                  },
                  scl: {
                    ...item('P', '2025-03-01').assets.scl,
                    href: 'https://sentinel2l2a01.blob.core.windows.net/P/SCL.tif',
                  },
                },
              },
            ],
            links: [],
          })
        : json({}, 502),
    )
    const r = await searchSentinel2({ ...args, fetchImpl })
    expect(r.source).toBe('pc:sentinel-2-l2a')
    expect(r.items[0]?.collection).toBe('pc:sentinel-2-l2a')
  })
  it('never swallows an abort', async () => {
    const ac = new AbortController()
    ac.abort()
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    await expect(searchSentinel2({ ...args, fetchImpl, signal: ac.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('snaps the bbox outward to 0.1 degrees on Earth Search and on the fallback', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url.includes('planetarycomputer') ? json({ features: [], links: [] }) : json({}, 502),
      )
    await searchSentinel2({ ...args, bbox: [79.0832, 21.1408, 79.0932, 21.1508], fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    for (const c of fetchImpl.mock.calls) expect(JSON.parse(c[1].body).bbox).toEqual([79, 21.1, 79.1, 21.2])
  })
  it('times out a stalled request, retries it, then falls back to Planetary Computer', async () => {
    const real = AbortSignal.timeout.bind(AbortSignal)
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => real(5)) // 20 s would stall the suite
    try {
      const fetchImpl = vi
        .fn()
        .mockImplementation((url: string, init: RequestInit) =>
          url.includes('planetarycomputer')
            ? Promise.resolve(json({ features: [pcItem('P', '2025-03-01')], links: [] }))
            : stall(init),
        )
      const r = await searchSentinel2({ ...args, fetchImpl })
      expect(timeout).toHaveBeenCalledWith(20_000)
      expect(fetchImpl).toHaveBeenCalledTimes(4) // 3 stalled Earth Search attempts, then Planetary Computer
      expect(r.source).toBe('pc:sentinel-2-l2a')
    } finally {
      timeout.mockRestore()
    }
  })
  it('rethrows a caller abort mid-flight without retrying or falling back', async () => {
    const ac = new AbortController()
    const fetchImpl = vi.fn().mockImplementation((_url: string, init: RequestInit) => stall(init))
    const p = searchSentinel2({ ...args, fetchImpl, signal: ac.signal })
    ac.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('stops before the back-off sleep once the caller has aborted', async () => {
    const ac = new AbortController()
    const fetchImpl = vi.fn().mockImplementation(async () => (ac.abort(), json({}, 503)))
    const sleep = vi.fn(async () => {})
    await expect(searchSentinel2({ ...args, fetchImpl, sleep, signal: ac.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })
  it('rethrows a 4xx instead of falling back to Planetary Computer', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => json({}, 400))
    await expect(searchSentinel2({ ...args, fetchImpl })).rejects.toMatchObject({ status: 400 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('never walks past 10 pages, whatever maxPages says', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () =>
      json({
        features: [item('X', '2025-02-01')],
        links: [
          { rel: 'next', method: 'POST', href: 'https://earth-search.aws.element84.com/v1/search', body: {} },
        ],
      }),
    )
    const r = await searchSentinel2({ ...args, fetchImpl, maxPages: 50 })
    expect(fetchImpl).toHaveBeenCalledTimes(10)
    expect(r.limited).toBe(true)
  })
})
