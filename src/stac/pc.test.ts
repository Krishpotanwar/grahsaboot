import { afterEach, describe, expect, it, vi } from 'vitest'
import type { S2Item } from './types.ts'

// pc.ts keeps the SAS token in module state, so every test loads a fresh copy.
const load = () => {
  vi.resetModules()
  return import('./pc.ts')
}
const sas = (expiry?: string) =>
  vi
    .fn()
    .mockImplementation(
      async () => new Response(JSON.stringify({ token: 'se=1&sig=abc', 'msft:expiry': expiry })),
    )
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const asset = (href: string) => ({
  href,
  transform: [10, 0, 0, 0, -10, 0],
  shape: [1, 1] as [number, number],
})
const mk = (collection: S2Item['collection']): S2Item => ({
  id: 'i',
  collection,
  datetime: '2025-01-01T00:00:00Z',
  date: '2025-01-01',
  epsg: 32644,
  cloudCover: null,
  baseline: null,
  nodataPct: null,
  footprint: [],
  visual: asset('https://x.test/v.tif'),
  scl: asset('https://x.test/s.tif'),
})

describe('signPcHref', () => {
  it('fetches the SAS token once and joins it with ? or &', async () => {
    const { signPcHref } = await load()
    const f = sas(new Date(Date.now() + 3_600_000).toISOString())
    expect(await signPcHref('https://x.test/a.tif', f)).toBe('https://x.test/a.tif?se=1&sig=abc')
    expect(await signPcHref('https://x.test/b.tif?v=2', f)).toBe('https://x.test/b.tif?v=2&se=1&sig=abc')
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('gives a token without msft:expiry a 5 minute life instead of caching it forever', async () => {
    const { signPcHref } = await load()
    vi.useFakeTimers({ toFake: ['Date'] })
    const f = sas()
    await signPcHref('https://x.test/a.tif', f)
    vi.setSystemTime(Date.now() + 3 * 60_000)
    await signPcHref('https://x.test/a.tif', f)
    expect(f).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 2 * 60_000)
    await signPcHref('https://x.test/a.tif', f)
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('time-boxes the token request and follows the caller signal', async () => {
    const { signPcHref } = await load()
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const ac = new AbortController()
    const f = sas()
    await signPcHref('https://x.test/a.tif', f, ac.signal)
    expect(timeout).toHaveBeenCalledWith(20_000)
    timeout.mockRestore()
    const s = f.mock.calls[0]![1].signal as AbortSignal
    expect(s.aborted).toBe(false)
    ac.abort()
    expect(s.aborted).toBe(true)
  })
})

describe('resolveItemHrefs', () => {
  it('signs Planetary Computer assets with one token and the caller signal; Earth Search items pass through', async () => {
    const { resolveItemHrefs } = await load()
    const f = sas()
    vi.stubGlobal('fetch', f)
    const ac = new AbortController()
    const pc = mk('pc:sentinel-2-l2a')
    const r = await resolveItemHrefs(pc, ac.signal)
    expect(r.visual.href).toBe('https://x.test/v.tif?se=1&sig=abc')
    expect(r.scl.href).toBe('https://x.test/s.tif?se=1&sig=abc')
    expect(pc.visual.href).toBe('https://x.test/v.tif') // provenance keeps the unsigned href
    expect(f).toHaveBeenCalledTimes(1)
    const s = f.mock.calls[0]![1].signal as AbortSignal
    ac.abort()
    expect(s.aborted).toBe(true)
    const es = mk('sentinel-2-l2a')
    expect(await resolveItemHrefs(es)).toBe(es)
  })
})
