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

// Run fn as on an older browser: the named static AbortSignal methods do not exist.
async function without(names: ('any' | 'timeout')[], fn: () => Promise<void>) {
  const saved = names.map((n) => [n, Object.getOwnPropertyDescriptor(AbortSignal, n)!] as const)
  for (const n of names) Reflect.deleteProperty(AbortSignal, n)
  try {
    await fn()
  } finally {
    for (const [n, d] of saved) Object.defineProperty(AbortSignal, n, d)
  }
}

const bounds = (init: RequestInit) =>
  (JSON.parse(init.body as string).datetime as string).split('/') as [string, string]
/** The windows a mock was asked for, as `from/to` days, oldest first. */
const windowsOf = (f: { mock: { calls: unknown[][] } }) =>
  f.mock.calls
    .map((c) =>
      (JSON.parse((c[1] as RequestInit).body as string).datetime as string).replace(/T[\d:]+Z/g, ''),
    )
    .sort()
const empty = () => json({ features: [], links: [] })
const three = { ...args, from: '2024-01-01', to: '2026-12-31' }
const six = { ...args, from: '2020-01-01', to: '2025-12-31' }
/** A STAC where every window has `pages[year]` pages of one item each; the last page has no next link. */
const paged = (pages: Record<string, number>) => {
  const seen: Record<string, number> = {}
  return vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
    const y = bounds(init)[0].slice(0, 4)
    const n = (seen[y] = (seen[y] ?? 0) + 1)
    return json({
      features: [item(`${y}-${n}`, `${y}-01-${String(n).padStart(2, '0')}`)],
      links:
        n < pages[y]!
          ? [
              {
                rel: 'next',
                method: 'POST',
                href: 'https://earth-search.aws.element84.com/v1/search',
                merge: true,
                body: { n },
              },
            ]
          : [],
    })
  })
}

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
  it('never walks past 5 pages in a window, whatever maxPages says', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () =>
      json({
        features: [item('X', '2025-02-01')],
        links: [
          { rel: 'next', method: 'POST', href: 'https://earth-search.aws.element84.com/v1/search', body: {} },
        ],
      }),
    )
    const r = await searchSentinel2({ ...args, fetchImpl, maxPages: 50 })
    expect(fetchImpl).toHaveBeenCalledTimes(5)
    expect(r.limited).toBe(true)
  })
  it('splits a 3-year range into 3 yearly windows, one request each', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => empty())
    await searchSentinel2({ ...three, fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(windowsOf(fetchImpl)).toEqual([
      '2024-01-01/2024-12-31',
      '2025-01-01/2025-12-31',
      '2026-01-01/2026-12-31',
    ])
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body).datetime).toBe(
      '2024-01-01T00:00:00Z/2024-12-31T23:59:59Z',
    )
  })
  it.each([
    ['one window up to 12 months', '2025-01-01', '2025-12-31', ['2025-01-01/2025-12-31']],
    ['one window from a leap day to its anniversary', '2024-02-29', '2025-02-28', ['2024-02-29/2025-02-28']],
    ['one window for a single day', '2025-06-01', '2025-06-01', ['2025-06-01/2025-06-01']],
    [
      'a second window for the 13th month',
      '2025-01-01',
      '2026-01-01',
      ['2025-01-01/2025-12-31', '2026-01-01/2026-01-01'],
    ],
    [
      'windows that follow the start day and end at `to`',
      '2024-03-15',
      '2026-06-10',
      ['2024-03-15/2025-03-14', '2025-03-15/2026-03-14', '2026-03-15/2026-06-10'],
    ],
    [
      'no gap or overlap across a missing 29 February',
      '2024-02-29',
      '2026-03-01',
      ['2024-02-29/2025-02-28', '2025-03-01/2026-02-28', '2026-03-01/2026-03-01'],
    ],
    [
      'the worked example',
      '2017-12-01',
      '2025-12-31',
      [
        '2017-12-01/2018-11-30',
        '2018-12-01/2019-11-30',
        '2019-12-01/2020-11-30',
        '2020-12-01/2021-11-30',
        '2021-12-01/2022-11-30',
        '2022-12-01/2023-11-30',
        '2023-12-01/2024-11-30',
        '2024-12-01/2025-11-30',
        '2025-12-01/2025-12-31',
      ],
    ],
  ])('windows: %s', async (_name, from, to, expected) => {
    const fetchImpl = vi.fn().mockImplementation(async () => empty())
    await searchSentinel2({ ...args, from, to, fetchImpl })
    expect(windowsOf(fetchImpl)).toEqual(expected)
  })
  it('merges the windows: deduped by id, oldest first, whatever order they answer in', async () => {
    const byYear: Record<string, ReturnType<typeof item>[]> = {
      '2024': [item('A', '2024-06-01'), item('DUP', '2024-12-31')],
      '2025': [item('B', '2025-03-01'), item('B0', '2025-01-15'), item('DUP', '2024-12-31')], // a window is not always in order
      '2026': [item('C', '2026-02-01')],
    }
    const wait: Record<string, number> = { '2024': 20, '2025': 10, '2026': 0 } // the oldest window answers last
    const fetchImpl = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const y = bounds(init)[0].slice(0, 4)
      await new Promise((r) => setTimeout(r, wait[y]))
      return json({ features: byYear[y], links: [] })
    })
    const r = await searchSentinel2({ ...three, fetchImpl })
    expect(r.items.map((i) => i.id)).toEqual(['A', 'DUP', 'B0', 'B', 'C'])
    expect(r.limited).toBe(false)
  })
  it('searches at most 3 windows at once', async () => {
    let live = 0
    let peak = 0
    const fetchImpl = vi.fn().mockImplementation(async () => {
      peak = Math.max(peak, ++live)
      await new Promise((r) => setTimeout(r, 5))
      live--
      return empty()
    })
    await searchSentinel2({ ...six, fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(6)
    expect(peak).toBe(3)
  })
  it('is limited only when a window hits its 5 pages with a next link left', async () => {
    const exact = paged({ '2024': 1, '2025': 5, '2026': 1 }) // 5 pages and then no next link: complete
    const a = await searchSentinel2({ ...three, fetchImpl: exact })
    expect(exact).toHaveBeenCalledTimes(7)
    expect(a.items).toHaveLength(7)
    expect(a.limited).toBe(false)
    const more = paged({ '2024': 1, '2025': 6, '2026': 1 }) // a 6th page exists but is not walked
    const b = await searchSentinel2({ ...three, fetchImpl: more })
    expect(more).toHaveBeenCalledTimes(7)
    expect(b.items).toHaveLength(7)
    expect(b.limited).toBe(true)
  })
  it('falls back to Planetary Computer for the whole range when one window fails', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      const y = bounds(init)[0].slice(0, 4)
      if (url.includes('planetarycomputer'))
        return json({ features: [pcItem(`P${y}`, `${y}-03-01`)], links: [] })
      return y === '2025' ? json({}, 502) : json({ features: [item(`E${y}`, `${y}-03-01`)], links: [] })
    })
    const r = await searchSentinel2({ ...three, fetchImpl })
    expect(r.source).toBe('pc:sentinel-2-l2a')
    expect(r.items.map((i) => i.id)).toEqual(['P2024', 'P2025', 'P2026']) // nothing from Earth Search is kept
    const pc = fetchImpl.mock.calls.filter(([u]) => u.includes('planetarycomputer'))
    expect(windowsOf({ mock: { calls: pc } })).toEqual([
      '2024-01-01/2024-12-31',
      '2025-01-01/2025-12-31',
      '2026-01-01/2026-12-31',
    ])
    for (const c of pc) expect(JSON.parse(c[1].body).fields).toBeUndefined()
  })
  it('aborts every window and starts no new one', async () => {
    const ac = new AbortController()
    const fetchImpl = vi.fn().mockImplementation((_url: string, init: RequestInit) => stall(init))
    const p = searchSentinel2({ ...six, fetchImpl, signal: ac.signal })
    ac.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    await new Promise((r) => setTimeout(r, 10))
    expect(fetchImpl).toHaveBeenCalledTimes(3) // the other 3 windows never started, and there was no fallback
  })
  it('starts no new window after an abort, even when a fetch ignores its signal', async () => {
    const ac = new AbortController()
    const fetchImpl = vi.fn().mockImplementation(async () => (ac.abort(), empty()))
    await expect(searchSentinel2({ ...six, fetchImpl, signal: ac.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
  it('still searches without AbortSignal.any (Safari < 17.4): caller signal alone, else the timeout alone', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => json({ features: [item('A', '2025-01-01')], links: [] }))
    const sent = () => fetchImpl.mock.calls.at(-1)![1].signal
    const ac = new AbortController()
    await without(['any'], async () => {
      expect((await searchSentinel2({ ...args, fetchImpl, signal: ac.signal })).items).toHaveLength(1)
      expect(sent()).toBe(ac.signal)
      expect((await searchSentinel2({ ...args, fetchImpl })).items).toHaveLength(1)
      expect(sent()).toBeInstanceOf(AbortSignal)
    })
    await without(['any', 'timeout'], async () => {
      expect((await searchSentinel2({ ...args, fetchImpl, signal: ac.signal })).items).toHaveLength(1)
      expect(sent()).toBe(ac.signal)
      expect((await searchSentinel2({ ...args, fetchImpl })).items).toHaveLength(1)
      expect(sent()).toBeUndefined()
    })
    expect(typeof AbortSignal.any).toBe('function') // restored
    expect(typeof AbortSignal.timeout).toBe('function')
  })
})
