import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNominatim } from './nominatim.ts'

const ROW = {
  display_name: 'Nagpur, Maharashtra, India',
  lat: '21.1458',
  lon: '79.0882',
  boundingbox: ['20.9', '21.3', '78.9', '79.3'],
}
const ok = (rows: unknown[]) => new Response(JSON.stringify(rows), { status: 200 })

describe('nominatim', () => {
  it('parses results into places with [w,s,e,n] bboxes', async () => {
    const n = createNominatim({
      baseUrl: 'https://x',
      fetchImpl: vi.fn().mockResolvedValue(ok([ROW])),
      sleep: async () => {},
    })
    expect(await n.search('Nagpur')).toEqual([
      { name: 'Nagpur, Maharashtra, India', lat: 21.1458, lon: 79.0882, bbox: [78.9, 20.9, 79.3, 21.3] },
    ])
  })
  it('caches repeated queries (case and space insensitive)', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => ok([ROW]))
    const n = createNominatim({ baseUrl: 'https://x', fetchImpl, sleep: async () => {} })
    await n.search('Nagpur')
    await n.search('  nagpur ')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('waits so requests are at least 1 s apart', async () => {
    let t = 1000
    const waits: number[] = []
    const n = createNominatim({
      baseUrl: 'https://x',
      fetchImpl: vi.fn().mockImplementation(async () => ok([])),
      now: () => t,
      sleep: async (ms) => {
        waits.push(ms)
        t += ms
      },
    })
    await n.search('a')
    t += 200
    await n.search('b')
    expect(waits).toEqual([800])
  })
  it('throws on HTTP errors and drops malformed rows', async () => {
    const bad = createNominatim({
      baseUrl: 'https://x',
      fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 503 })),
      sleep: async () => {},
    })
    await expect(bad.search('x')).rejects.toThrow('NOMINATIM_503')
    const odd = createNominatim({
      baseUrl: 'https://x',
      fetchImpl: vi.fn().mockResolvedValue(ok([{ display_name: 1 }, ROW])),
      sleep: async () => {},
    })
    expect(await odd.search('y')).toHaveLength(1)
  })
  it('sends the query encoded and asks for English names', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([]))
    await createNominatim({ baseUrl: 'https://x', fetchImpl, sleep: async () => {} }).search(
      'Sitabuldi & Fort',
    )
    expect(fetchImpl.mock.calls[0]![0]).toBe(
      'https://x/search?format=jsonv2&limit=5&q=Sitabuldi%20%26%20Fort',
    )
    expect(fetchImpl.mock.calls[0]![1].headers['Accept-Language']).toBe('en')
  })
})

describe('the time limit', () => {
  afterEach(() => vi.restoreAllMocks())
  /** A server that accepts the request and never answers. Like the browser's fetch, it rejects with the signal's reason when the signal fires. */
  const silent = () =>
    vi
      .fn()
      .mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_, reject) =>
            init.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true }),
          ),
      )
  const search = (fetchImpl: ReturnType<typeof silent>, signal?: AbortSignal) =>
    createNominatim({ baseUrl: 'https://x', fetchImpl, sleep: async () => {} }).search('Nagpur', signal)
  /**
   * Node's AbortSignal.timeout is not driven by vitest's fake timers (measured: still not aborted after a faked 10 s), so the test
   * holds the clock itself: each timeout signal it hands out fires when the test says. The real timer is the e2e's (Playwright's clock).
   */
  const clock = () => {
    const fires: Array<{ ms: number; fire(): void }> = []
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const c = new AbortController()
      fires.push({ ms, fire: () => c.abort(new DOMException('The operation timed out.', 'TimeoutError')) })
      return c.signal
    })
    return fires
  }

  it('ends a search that never answers after 10 s, with a timeout that is not an abort', async () => {
    const fires = clock()
    const pending = search(silent(), new AbortController().signal)
    expect(fires.map((f) => f.ms)).toEqual([10_000])
    fires[0]!.fire()
    await expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
  })
  it('limits a search that has no caller signal the same way', async () => {
    const fires = clock()
    const pending = search(silent())
    expect(fires.map((f) => f.ms)).toEqual([10_000])
    fires[0]!.fire()
    await expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
  })
  it('still ends at once when the caller aborts, whatever time is left', async () => {
    clock() // the limit is there but never fires: nothing here may wait for it
    const ac = new AbortController()
    const pending = search(silent(), ac.signal)
    ac.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('passes the caller its own signal, untimed, where AbortSignal.any is missing (Safari before 17.4)', async () => {
    const any = Object.getOwnPropertyDescriptor(AbortSignal, 'any')!
    Object.defineProperty(AbortSignal, 'any', { ...any, value: undefined })
    try {
      const fetchImpl = vi.fn().mockResolvedValue(ok([]))
      const ac = new AbortController()
      await search(fetchImpl, ac.signal)
      expect(fetchImpl.mock.calls[0]![1].signal).toBe(ac.signal)
    } finally {
      Object.defineProperty(AbortSignal, 'any', any)
    }
  })
})
