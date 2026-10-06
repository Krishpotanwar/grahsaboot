import { getEventListeners } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { createImageryClient, type WorkerLike } from './imagery-client.ts'

class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null
  sent: any[] = []
  postMessage(msg: any) {
    this.sent.push(msg)
    if (msg.op === 'quality')
      queueMicrotask(() =>
        this.onmessage?.({
          data: { id: msg.id, ok: true, result: { echo: msg.req.item.id } },
        } as MessageEvent),
      )
  }
  terminate() {}
}
const req = { item: { id: 'X', collection: 'sentinel-2-l2a' }, aoi: { kind: 'site', rings: [] } } as any

describe('imagery client', () => {
  it('correlates responses by id', async () => {
    const w = new FakeWorker()
    const c = createImageryClient(() => w)
    expect(await c.quality(req)).toEqual({ echo: 'X' })
  })
  it('cancels on abort and rejects with AbortError', async () => {
    const w = new FakeWorker()
    const c = createImageryClient(() => w)
    const ac = new AbortController()
    const p = c.frame({ ...req, level: 0, grid: {} }, ac.signal)
    ac.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()
    expect(w.sent.some((m) => m.op === 'cancel')).toBe(true)
  })
  it('rejects with TimeoutError when the worker never answers, and tells it to stop', async () => {
    vi.useFakeTimers()
    try {
      const w = new FakeWorker()
      const c = createImageryClient(() => w)
      const done = expect(c.frame({ ...req, level: 0, grid: {} })).rejects.toMatchObject({
        name: 'TimeoutError',
        message: 'IMAGERY_TIMEOUT',
      })
      await vi.advanceTimersByTimeAsync(120_000)
      await done
      expect(w.sent.some((m) => m.op === 'cancel')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
  it('fails waiting and later calls at once when the worker dies', async () => {
    const w = new FakeWorker()
    const c = createImageryClient(() => w)
    const p = c.frame({ ...req, level: 0, grid: {} })
    ;(w as WorkerLike).onerror?.(new Event('error'))
    await expect(p).rejects.toThrow('IMAGERY_WORKER_FAILED')
    await expect(c.quality(req)).rejects.toThrow('IMAGERY_WORKER_FAILED')
  })
  it('rejects every later call at once after dispose, without posting to the dead worker', async () => {
    const w = new FakeWorker()
    const c = createImageryClient(() => w)
    c.dispose()
    await expect(c.quality(req)).rejects.toMatchObject({ name: 'AbortError' })
    expect(w.sent).toEqual([])
  })
  describe('abort listener on the caller signal', () => {
    // A long-lived signal shared by many calls must not collect a handler per settled request.
    const held = (s: AbortSignal) => getEventListeners(s, 'abort').length
    it('is removed when the request resolves', async () => {
      const ac = new AbortController()
      await createImageryClient(() => new FakeWorker()).quality(req, ac.signal)
      expect(held(ac.signal)).toBe(0)
    })
    it('is removed when the worker reports an error', async () => {
      const w = new FakeWorker()
      w.postMessage = (m) =>
        queueMicrotask(() =>
          w.onmessage?.({
            data: { id: m.id, ok: false, error: { name: 'Boom', message: 'bad' } },
          } as MessageEvent),
        )
      const ac = new AbortController()
      await expect(
        createImageryClient(() => w).frame({ ...req, level: 0, grid: {} }, ac.signal),
      ).rejects.toThrow('bad')
      expect(held(ac.signal)).toBe(0)
    })
    it('is removed when the request times out', async () => {
      vi.useFakeTimers()
      try {
        const ac = new AbortController()
        const done = expect(
          createImageryClient(() => new FakeWorker()).frame({ ...req, level: 0, grid: {} }, ac.signal),
        ).rejects.toMatchObject({ name: 'TimeoutError' })
        await vi.advanceTimersByTimeAsync(120_000)
        await done
        expect(held(ac.signal)).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    })
    it('is removed when the Planetary Computer token request fails', async () => {
      vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
      try {
        const item = {
          ...req.item,
          collection: 'pc:sentinel-2-l2a',
          visual: { href: 'https://x/v.tif' },
          scl: { href: 'https://x/s.tif' },
        }
        const ac = new AbortController()
        await expect(
          createImageryClient(() => new FakeWorker()).quality({ ...req, item }, ac.signal),
        ).rejects.toThrow('offline')
        expect(held(ac.signal)).toBe(0)
      } finally {
        vi.unstubAllGlobals()
      }
    })
  })
  it('cancels the Planetary Computer token request when aborted', async () => {
    let sig: AbortSignal | undefined
    vi.stubGlobal('fetch', (_u: unknown, init?: RequestInit) => {
      sig = init?.signal ?? undefined
      return new Promise(() => {})
    })
    try {
      const c = createImageryClient(() => new FakeWorker())
      const ac = new AbortController()
      const item = {
        ...req.item,
        collection: 'pc:sentinel-2-l2a',
        visual: { href: 'https://x/v.tif' },
        scl: { href: 'https://x/s.tif' },
      }
      const p = c.quality({ ...req, item }, ac.signal)
      ac.abort()
      await expect(p).rejects.toMatchObject({ name: 'AbortError' })
      expect(sig?.aborted).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
