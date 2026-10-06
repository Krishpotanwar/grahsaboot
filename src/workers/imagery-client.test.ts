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
