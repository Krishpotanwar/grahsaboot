import { getEventListeners } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHANGE_CONSTANTS, CHANGE_RECIPE, type ChangeResult } from '../evidence/change.ts'
import { makeDisplayGrid } from '../evidence/display.ts'
import { countMask, rasterizeOnGrid } from '../evidence/mask.ts'
import { toAoiGeometry, type AoiInput } from '../geo/aoi.ts'
import { createImageryClient, type WorkerLike } from '../workers/imagery-client.ts'
import { MEASURE_DEADLINE_MS, measurePair, type MeasureInput } from './Report.tsx'

// The report's one call to the change rule (ruling R46): `measurePair` owns the client, the deadline and every failure, and gives
// the result or undefined, which is the report without the "What we measured" block. It never throws and never logs.
const GRID = makeDisplayGrid([79.0832, 21.1408, 79.0932, 21.1508], 64)
const N = GRID.width * GRID.height
const SITE: AoiInput = {
  kind: 'site',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [79.0832, 21.1408],
        [79.0932, 21.1408],
        [79.0932, 21.1508],
        [79.0832, 21.1508],
        [79.0832, 21.1408],
      ],
    ],
  },
}
const ROAD: AoiInput = {
  kind: 'road',
  geometry: {
    type: 'LineString',
    coordinates: [
      [79.0832, 21.1458],
      [79.0932, 21.1458],
    ],
  },
  widthM: 30,
}
const picture = (v: number) => ({ rgba: new Uint8ClampedArray(N * 4).fill(v), invalid: new Uint8Array(N) })
const RESULT: ChangeResult = {
  recipe: CHANGE_RECIPE,
  constants: CHANGE_CONSTANTS,
  clearPixels: 123,
  state: 'nothing',
  shift: [0, 0, 0],
}

type Sent = { id: number; op: string; req?: Record<string, unknown>; target?: number }
/** What the worker does with a `change` request: answers it, fails it, dies, or says nothing at all. */
type Mode = 'answer' | 'fail' | 'die' | 'silent'
class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  sent: Sent[] = []
  terminated = false
  constructor(private mode: Mode = 'answer') {}
  postMessage(msg: Sent) {
    this.sent.push(msg)
    if (msg.op !== 'change') return
    if (this.mode === 'answer')
      queueMicrotask(() =>
        this.onmessage?.({ data: { id: msg.id, ok: true, result: RESULT } } as MessageEvent),
      )
    if (this.mode === 'fail')
      queueMicrotask(() =>
        this.onmessage?.({
          data: { id: msg.id, ok: false, error: { name: 'Error', message: 'SIZE_MISMATCH' } },
        } as MessageEvent),
      )
    if (this.mode === 'die') queueMicrotask(() => this.onerror?.(new Event('error')))
  }
  terminate() {
    this.terminated = true
  }
  changes = () => this.sent.filter((m) => m.op === 'change')
}

const run = (w: FakeWorker, over: Partial<MeasureInput> = {}) =>
  measurePair({
    makeClient: () => createImageryClient(() => w),
    aoi: SITE,
    grid: GRID,
    before: picture(60),
    after: picture(70),
    signal: new AbortController().signal,
    ...over,
  })

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('measurePair', () => {
  it('gives the result of the rule, run in the worker on the pair as it is, with the outline as its inside mask', async () => {
    const w = new FakeWorker()
    const before = picture(60)
    const after = picture(70)
    const aoi = deepCopy(SITE)
    expect(await run(w, { before, after, aoi })).toEqual(RESULT)
    const [call] = w.changes()
    expect(w.changes()).toHaveLength(1)
    // the arrays are the ones the report holds, not copies: the client clones them when it posts (R42), so nobody slices first
    const req = call!.req as Record<string, any>
    expect(req.first.rgba).toBe(before.rgba)
    expect(req.first.invalid).toBe(before.invalid)
    expect(req.last.rgba).toBe(after.rgba)
    expect(req.last.invalid).toBe(after.invalid)
    expect(req.grid).toBe(GRID)
    expect(req.inside).toEqual(rasterizeOnGrid(toAoiGeometry(aoi), GRID))
    expect(countMask(req.inside)).toBeGreaterThan(0)
    expect(req.inside).toHaveLength(N)
  })

  it('masks a road as its corridor', async () => {
    const w = new FakeWorker()
    await run(w, { aoi: ROAD })
    const req = w.changes()[0]!.req as Record<string, any>
    expect(req.inside).toEqual(rasterizeOnGrid(toAoiGeometry(ROAD), GRID))
    expect(countMask(req.inside)).toBeGreaterThan(0)
    expect(countMask(req.inside)).toBeLessThan(N / 4)
  })

  it('leaves the pictures and the marks of the report as they were, and its own worker ended after the answer', async () => {
    const w = new FakeWorker()
    const before = picture(60)
    const sum = (a: ArrayLike<number>) => Array.from(a).reduce((x, y) => x + y, 0)
    const [a, b] = [sum(before.rgba), before.rgba.length]
    await run(w, { before })
    expect([sum(before.rgba), before.rgba.length, before.invalid.length]).toEqual([a, b, N])
    expect(w.terminated).toBe(true)
  })

  it('waits for a worker that never answers no longer than the deadline, then gives undefined and ends the worker', async () => {
    vi.useFakeTimers()
    const w = new FakeWorker('silent')
    let settled = false
    const p = run(w).then((r) => {
      settled = true
      return r
    })
    await vi.advanceTimersByTimeAsync(MEASURE_DEADLINE_MS - 1)
    expect(settled).toBe(false)
    expect(w.terminated).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await p).toBeUndefined()
    expect(w.sent.some((m) => m.op === 'cancel')).toBe(true)
    expect(w.terminated).toBe(true)
  })

  it('has a deadline of 10 s, far under the 120 s the imagery client would wait', () => {
    expect(MEASURE_DEADLINE_MS).toBe(10_000)
  })

  it('stops at once, with undefined, when the report is left while the rule runs', async () => {
    const w = new FakeWorker('silent')
    const leave = new AbortController()
    const p = run(w, { signal: leave.signal })
    await Promise.resolve()
    leave.abort()
    expect(await p).toBeUndefined()
    expect(w.terminated).toBe(true)
  })

  it('does not even make a worker when the report has already been left', async () => {
    const makeClient = vi.fn()
    const leave = new AbortController()
    leave.abort()
    expect(await run(new FakeWorker(), { makeClient, signal: leave.signal })).toBeUndefined()
    expect(makeClient).not.toHaveBeenCalled()
  })

  it('does not measure without a cloud mark for each picture: a missing mark is never read as all clear', async () => {
    for (const missing of ['before', 'after'] as const) {
      const makeClient = vi.fn()
      const input = { rgba: new Uint8ClampedArray(N * 4), invalid: null }
      expect(await run(new FakeWorker(), { makeClient, [missing]: input }), missing).toBeUndefined()
      expect(makeClient, missing).not.toHaveBeenCalled()
    }
  })

  it('gives undefined when the worker fails the request, when it dies, and when none can be made', async () => {
    expect(await run(new FakeWorker('fail'))).toBeUndefined()
    expect(await run(new FakeWorker('die'))).toBeUndefined()
    const none = () => {
      throw new Error('NO_WORKER')
    }
    expect(await run(new FakeWorker(), { makeClient: none })).toBeUndefined()
  })

  it('ends the worker it made however the run ends', async () => {
    for (const mode of ['answer', 'fail', 'die'] as const) {
      const w = new FakeWorker(mode)
      await run(w)
      expect(w.terminated, mode).toBe(true)
    }
  })

  it('writes nothing to the console, whatever happens', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    )
    vi.useFakeTimers()
    for (const mode of ['answer', 'fail', 'die'] as const) await run(new FakeWorker(mode))
    const slow = run(new FakeWorker('silent'))
    await vi.advanceTimersByTimeAsync(MEASURE_DEADLINE_MS)
    await slow
    const leave = new AbortController()
    const left = run(new FakeWorker('silent'), { signal: leave.signal })
    leave.abort()
    await left
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('leaves no handler on the signal it is given, whether the run ends well or not', async () => {
    for (const mode of ['answer', 'fail', 'die'] as const) {
      const leave = new AbortController()
      await run(new FakeWorker(mode), { signal: leave.signal })
      expect(getEventListeners(leave.signal, 'abort'), mode).toHaveLength(0)
    }
    vi.useFakeTimers()
    const leave = new AbortController()
    const slow = run(new FakeWorker('silent'), { signal: leave.signal })
    await vi.advanceTimersByTimeAsync(MEASURE_DEADLINE_MS)
    await slow
    expect(getEventListeners(leave.signal, 'abort')).toHaveLength(0)
  })
})

function deepCopy<T>(v: T): T {
  return structuredClone(v)
}
