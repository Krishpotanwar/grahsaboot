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

describe('imagery client: the change request', () => {
  // A worker that does what the platform does with a transfer list: the buffers listed leave the sender, the rest is copied.
  class CloningWorker extends FakeWorker {
    received: any[] = []
    transfers: Array<Transferable[] | undefined> = []
    override postMessage(msg: any, transfer?: Transferable[]) {
      super.postMessage(msg)
      if (msg.op !== 'change') return
      this.transfers.push(transfer)
      this.received.push(structuredClone(msg, { transfer }))
      queueMicrotask(() =>
        this.onmessage?.({ data: { id: msg.id, ok: true, result: { state: 'nothing' } } } as MessageEvent),
      )
    }
  }
  const changeReq = () => ({
    first: { rgba: Uint8ClampedArray.from({ length: 16 }, (_, i) => i), invalid: new Uint8Array(4) },
    last: { rgba: Uint8ClampedArray.from({ length: 16 }, (_, i) => 100 + i), invalid: new Uint8Array(4) },
    grid: { width: 2, height: 2 } as any, // the client never reads it
    inside: Uint8Array.from([1, 1, 1, 0]),
  })
  const held = (s: AbortSignal) => getEventListeners(s, 'abort').length

  it('sends the pictures and masks to the worker with no item to resolve, and answers with its result', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('the change request must not fetch anything')))
    try {
      const w = new CloningWorker()
      const r = changeReq()
      expect(await createImageryClient(() => w).change(r)).toEqual({ state: 'nothing' })
      expect(w.received[0].op).toBe('change')
      expect([...w.received[0].req.last.rgba]).toEqual(Array.from({ length: 16 }, (_, i) => 100 + i))
      expect([...w.received[0].req.inside]).toEqual([1, 1, 1, 0])
    } finally {
      vi.unstubAllGlobals()
    }
  })
  // The contract of `change` (ruling R36, plan D14): the arrays the caller passes are DETACHED by the call, so callers pass copies.
  it('detaches the arrays it is given: the worker has the data and the caller has empty arrays', async () => {
    const w = new CloningWorker()
    const r = changeReq()
    const arrays = [r.first.rgba, r.last.rgba, r.first.invalid, r.last.invalid, r.inside]
    const buffers = arrays.map((a) => a.buffer)
    await createImageryClient(() => w).change(r)
    expect(w.transfers[0]).toEqual(buffers)
    for (const a of arrays) {
      expect(a).toHaveLength(0)
      expect(a.byteLength).toBe(0)
      expect(a.buffer.byteLength).toBe(0)
    }
    expect([...w.received[0].req.first.rgba]).toEqual(Array.from({ length: 16 }, (_, i) => i))
    expect([...w.received[0].req.inside]).toEqual([1, 1, 1, 0])
  })
  it('fails loudly, rather than compare empty pictures, when it is given arrays it already took', async () => {
    const c = createImageryClient(() => new CloningWorker())
    const r = changeReq()
    await c.change(r)
    await expect(c.change(r)).rejects.toMatchObject({ name: 'DataCloneError' })
  })
  it('detaches nothing of a request it refuses before posting', async () => {
    const r = changeReq()
    await expect(
      createImageryClient(() => new CloningWorker()).change(r, AbortSignal.abort()),
    ).rejects.toThrow()
    expect(r.first.rgba).toHaveLength(16)
    expect(r.inside).toHaveLength(4)
  })
  it('lists a buffer once, and copies a view of part of a larger buffer instead of detaching it', async () => {
    const w = new CloningWorker()
    const r = changeReq()
    const shared = new Uint8ClampedArray(16)
    const big = new ArrayBuffer(32)
    const part = new Uint8Array(big, 8, 4).fill(1)
    await createImageryClient(() => w).change({
      first: { rgba: shared },
      last: { rgba: shared },
      grid: r.grid,
      inside: part,
    })
    expect(w.transfers[0]).toEqual([shared.buffer])
    expect(big.byteLength).toBe(32)
    expect([...w.received[0].req.inside]).toEqual([1, 1, 1, 1])
  })
  it('rejects, rather than throws, for a request it cannot hand over, and leaves no timer or listener behind', async () => {
    vi.useFakeTimers()
    try {
      const ac = new AbortController()
      const bad = { first: undefined, last: undefined, grid: {} } as any
      const p = createImageryClient(() => new FakeWorker()).change(bad, ac.signal)
      await expect(p).rejects.toBeInstanceOf(TypeError)
      expect(vi.getTimerCount()).toBe(0)
      expect(held(ac.signal)).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
  it('rejects with the worker error', async () => {
    const w = new FakeWorker()
    w.postMessage = (m: any) =>
      queueMicrotask(() =>
        w.onmessage?.({
          data: { id: m.id, ok: false, error: { name: 'Error', message: 'SIZE_MISMATCH' } },
        } as MessageEvent),
      )
    await expect(createImageryClient(() => w).change(changeReq())).rejects.toThrow('SIZE_MISMATCH')
  })
  it('rejects with AbortError when aborted while waiting, posts only a cancel, and drops its listener', async () => {
    const w = new FakeWorker()
    const ac = new AbortController()
    const p = createImageryClient(() => w).change(changeReq(), ac.signal)
    ac.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()
    expect(w.sent.map((m) => m.op)).toEqual(['cancel'])
    expect(held(ac.signal)).toBe(0)
  })
  it('rejects at once, posting nothing, for a signal that is already aborted', async () => {
    const w = new FakeWorker()
    await expect(createImageryClient(() => w).change(changeReq(), AbortSignal.abort())).rejects.toMatchObject(
      { name: 'AbortError' },
    )
    expect(w.sent).toEqual([])
  })
  it('rejects with TimeoutError when the worker never answers, and tells it to stop', async () => {
    vi.useFakeTimers()
    try {
      const w = new FakeWorker()
      const done = expect(createImageryClient(() => w).change(changeReq())).rejects.toMatchObject({
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
  it('fails when the worker dies, and after dispose without posting', async () => {
    const w = new FakeWorker()
    const c = createImageryClient(() => w)
    const p = c.change(changeReq())
    ;(w as WorkerLike).onerror?.(new Event('error'))
    await expect(p).rejects.toThrow('IMAGERY_WORKER_FAILED')
    const d = new FakeWorker()
    const gone = createImageryClient(() => d)
    gone.dispose()
    await expect(gone.change(changeReq())).rejects.toMatchObject({ name: 'AbortError' })
    expect(d.sent).toEqual([])
  })
})
