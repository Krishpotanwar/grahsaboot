import { afterEach, describe, expect, it, vi } from 'vitest'

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
afterEach(() => vi.useRealTimers())

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
