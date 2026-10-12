import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { keepAlive } from './index.ts'

const ASSETS = { fetch: vi.fn(async () => new Response('<!doctype html>')) }
const env = { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'pk' }
const RPC = 'https://abc.supabase.co/rest/v1/rpc/keep_alive'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('keepAlive', () => {
  it('calls the keep_alive RPC with the publishable key', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response('1'))
    await keepAlive(env, f)
    expect(f).toHaveBeenCalledOnce()
    const [url, init] = f.mock.calls[0]!
    expect(url).toBe(RPC)
    expect(init).toMatchObject({ method: 'POST', body: '{}' })
    // The key goes in `apikey` only: a publishable key is not a JWT, so it is never sent as a bearer token.
    expect(init?.headers).toEqual({ apikey: 'pk', 'content-type': 'application/json' })
  })

  it.each([
    ['nothing set', {}],
    ['no key', { SUPABASE_URL: env.SUPABASE_URL }],
    ['no URL', { SUPABASE_PUBLISHABLE_KEY: 'pk' }],
    ['empty values', { SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '' }],
    ['an empty key', { ...env, SUPABASE_PUBLISHABLE_KEY: '' }],
    ['an http URL', { ...env, SUPABASE_URL: 'http://abc.supabase.co' }],
    ['a URL without a scheme', { ...env, SUPABASE_URL: 'abc.supabase.co' }],
  ])('does nothing with %s', async (_name, e) => {
    const f = vi.fn<typeof fetch>()
    await expect(keepAlive(e, f)).resolves.toBeUndefined()
    expect(f).not.toHaveBeenCalled()
  })

  it('copes with a trailing slash on the project URL', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response('1'))
    await keepAlive({ ...env, SUPABASE_URL: 'https://abc.supabase.co/' }, f)
    expect(f.mock.calls[0]![0]).toBe(RPC)
  })

  it('gives the request a 5 s abort signal, and resolves when that signal fires', async () => {
    const stop = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(stop.signal)
    // An upstream that never answers: it rejects only when the request's own signal aborts.
    const f = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init!.signal!
          signal.addEventListener('abort', () => reject(signal.reason))
        }),
    )
    const done = keepAlive(env, f)
    expect(timeout).toHaveBeenCalledWith(5000)
    expect(f.mock.calls[0]![1]!.signal).toBe(stop.signal)
    stop.abort(new DOMException('timed out', 'TimeoutError'))
    await expect(done).resolves.toBeUndefined()
  })

  it.each<[string, () => Promise<Response>]>([
    ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
    [
      'a synchronous throw',
      () => {
        throw new Error('boom')
      },
    ],
    ['a 500 answer', async () => new Response('down', { status: 500 })],
    ['a 401 answer', async () => new Response('{}', { status: 401 })],
  ])('never throws on %s: the cron must not alert', async (_name, answer) => {
    const f = vi.fn<typeof fetch>(answer)
    await expect(keepAlive(env, f)).resolves.toBeUndefined()
    expect(f).toHaveBeenCalledOnce()
  })
})

describe('scheduled', () => {
  const ctx = () => ({ waitUntil: vi.fn<(p: Promise<unknown>) => void>() })

  it('hands the keep-alive to ctx.waitUntil, calling the global fetch without a receiver', async () => {
    const seen: unknown[] = []
    vi.stubGlobal('fetch', function (this: unknown, input: string) {
      // workerd throws "Illegal invocation" for any receiver but the global, as in worker/index.test.ts.
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation')
      seen.push(input)
      return Promise.resolve(new Response('1'))
    })
    const c = ctx()
    await worker.scheduled({}, { ASSETS, ...env }, c)
    expect(c.waitUntil).toHaveBeenCalledOnce()
    const pending = c.waitUntil.mock.calls[0]![0]
    expect(pending).toBeInstanceOf(Promise)
    await pending
    expect(seen).toEqual([RPC])
  })

  it('still settles, and calls nothing, when the Worker has no Supabase variables', async () => {
    const up = vi.fn()
    vi.stubGlobal('fetch', up)
    const c = ctx()
    await worker.scheduled({}, { ASSETS }, c)
    expect(c.waitUntil).toHaveBeenCalledOnce()
    await expect(c.waitUntil.mock.calls[0]![0]).resolves.toBeUndefined()
    expect(up).not.toHaveBeenCalled()
  })
})
