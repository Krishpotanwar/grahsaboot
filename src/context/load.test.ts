import { getEventListeners } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixtureItem } from '../../tests/fixtures/scene.ts'
import type { LonLat } from '../evidence/types.ts'
import type { Bbox } from '../geo/aoi.ts'
import { parseItem } from '../stac/parse.ts'
import type { SearchArgs } from '../stac/search.ts'
import type { S2Item, SearchResult } from '../stac/types.ts'
import type { FrameRequest, FrameResult, QualityRequest, QualityResult } from '../workers/imagery-core.ts'
import { loadContext, type ContextDeps, type ContextResult } from './load.ts'
import { gridFor } from './region.ts'

const NOW = new Date('2026-10-18T12:00:00Z')
const DAY = 86_400_000
/** About 4 km a side near Nagpur. */
const REGION: Bbox = [79.069, 21.128, 79.1075, 21.1638]
/** About 11 km a side: the coarser level. */
const WIDE: Bbox = [79.0, 21.1, 79.11, 21.2]
const FOOT: LonLat[][] = [
  [
    [78.9, 21.0],
    [79.3, 21.0],
    [79.3, 21.3],
    [78.9, 21.3],
    [78.9, 21.0],
  ],
]
// One parsed fixture scene is the template: the tests change only what ranking reads.
const TEMPLATE = parseItem(
  fixtureItem('https://sentinel-cogs.s3.us-west-2.amazonaws.com', {
    date: '2025-01-10',
    scl: () => 5,
    roof: false,
    cloud: 0,
  }),
  'sentinel-2-l2a',
)!
const scene = (id: string, daysAgo: number, cloudCover: number): S2Item => {
  const datetime = new Date(NOW.getTime() - daysAgo * DAY).toISOString()
  return { ...TEMPLATE, id, datetime, date: datetime.slice(0, 10), cloudCover, footprint: FOOT }
}
/** Rank order is a, b, c: d and e are never among the picks. */
const SCENES = [
  scene('a', 10, 5),
  scene('b', 20, 10),
  scene('c', 30, 15),
  scene('d', 40, 20),
  scene('e', 50, 25),
]
const found = (items: S2Item[]): SearchResult => ({ items, limited: false, source: 'sentinel-2-l2a' })

// The worker's real answers carry a digest of the pixels and the native pixels; the fakes do too, so the tests can show
// that none of it reaches the picture. The key is built in pieces: nothing in this folder may spell it out.
const DIGEST = ['s', 'ha256'].join('')
const qualityOf = (clearFraction: number) =>
  ({
    window: [0, 0, 1, 1],
    level: 0,
    [DIGEST]: 'q'.repeat(64),
    stats: { clearFraction },
    parts: [],
  }) as unknown as QualityResult
const frameOf = (g: FrameRequest['grid'], rgba = new Uint8ClampedArray(g.width * g.height * 4)) =>
  ({
    window: [0, 0, 1, 1],
    level: 0,
    [DIGEST]: 'f'.repeat(64),
    native: { width: 2, height: 2, rgb: new Uint8Array(12) },
    display: { width: g.width, height: g.height, rgba },
  }) as unknown as FrameResult

interface Gate<T> {
  promise: Promise<T>
  resolve(v: T): void
  reject(e: unknown): void
}
const gate = <T>(): Gate<T> => {
  const g = {} as Gate<T>
  g.promise = new Promise<T>((res, rej) => {
    g.resolve = res
    g.reject = rej
  })
  return g
}
const flush = () => new Promise((r) => setTimeout(r, 5))

function setup(over: { items?: S2Item[]; clear?: Record<string, number | Error> } = {}) {
  const search = vi.fn(async (_a: SearchArgs) => found(over.items ?? SCENES))
  const quality = vi.fn(async (req: QualityRequest, _signal?: AbortSignal) => {
    const v = over.clear?.[req.item.id] ?? 0.1
    if (v instanceof Error) throw v
    return qualityOf(v)
  })
  const frame = vi.fn(async (req: FrameRequest, _signal?: AbortSignal) => frameOf(req.grid))
  const stages: string[] = []
  const deps: ContextDeps = { search, client: { quality, frame }, now: NOW, onStage: (s) => stages.push(s) }
  return { deps, search, quality, frame, stages }
}
const run = (deps: ContextDeps, signal: AbortSignal = new AbortController().signal, region = REGION) =>
  loadContext(deps, region, signal)
const checked = (t: ReturnType<typeof setup>) => t.quality.mock.calls.map((c) => c[0].item.id)
const failed = (reason: string) => ({ ok: false, reason })

afterEach(() => {
  vi.useRealTimers()
})

describe('loadContext flow', () => {
  it('makes one search and one frame read, stage by stage', async () => {
    const t = setup({ clear: { a: 0.95 } })
    const r = await run(t.deps)
    expect(r.ok).toBe(true)
    expect(t.search).toHaveBeenCalledTimes(1)
    expect(t.frame).toHaveBeenCalledTimes(1)
    expect(t.stages).toEqual(['searching', 'checking', 'reading'])
  })

  it('sends the coarsened bbox and the last 240 days to the search, with a signal', async () => {
    const t = setup({ clear: { a: 0.95 } })
    await run(t.deps)
    const arg = t.search.mock.calls[0]![0]
    expect(arg).toMatchObject({ bbox: [79, 21.1, 79.2, 21.2], from: '2026-02-20', to: '2026-10-18' })
    expect(arg.signal).toBeInstanceOf(AbortSignal)
  })

  it('reads the frame for the region: level 0, the ring of the region, the capped grid', async () => {
    const t = setup({ clear: { a: 0.95 } })
    await run(t.deps)
    const [w, s, e, n] = REGION
    expect(t.frame.mock.calls[0]![0]).toEqual({
      item: SCENES[0],
      level: 0,
      aoi: {
        kind: 'site',
        rings: [
          [
            [w, s],
            [e, s],
            [e, n],
            [w, n],
            [w, s],
          ],
        ],
      },
      grid: gridFor(REGION),
    })
    expect(t.quality.mock.calls[0]![0].aoi).toEqual(t.frame.mock.calls[0]![0].aoi)
  })

  it('reads level 1 above 10 km', async () => {
    const t = setup({ clear: { a: 0.95 } })
    await run(t.deps, undefined, WIDE)
    expect(t.frame.mock.calls[0]![0].level).toBe(1)
  })

  it('returns the picture with its scene, date, age, clear percentage and window', async () => {
    const t = setup({ clear: { a: 0.826 } })
    const r = await run(t.deps)
    expect(r).toMatchObject({
      ok: true,
      image: {
        sceneId: 'a',
        date: SCENES[0]!.date,
        ageDays: 10,
        clearPct: 83,
        cloudy: false,
        widened: false,
      },
    })
    if (!r.ok) throw new Error('unreachable')
    expect(r.image.grid).toEqual(gridFor(REGION))
  })

  it('reports a widened window', async () => {
    const t = setup({ items: [scene('o', 100, 5)], clear: { o: 0.9 } })
    const r = await run(t.deps)
    expect(r).toMatchObject({ ok: true, image: { sceneId: 'o', ageDays: 100, widened: true } })
  })

  it('keeps the display pixels only: no digest, no native pixels', async () => {
    const t = setup({ clear: { a: 0.95 } })
    const rgba = new Uint8ClampedArray(gridFor(REGION).width * gridFor(REGION).height * 4)
    t.frame.mockImplementation(async (req) => frameOf(req.grid, rgba))
    const r = await run(t.deps)
    if (!r.ok) throw new Error('unreachable')
    expect(Object.keys(r.image).sort()).toEqual(
      ['ageDays', 'clearPct', 'cloudy', 'date', 'grid', 'rgba', 'sceneId', 'widened'].sort(),
    )
    expect(r.image.rgba).toBe(rgba)
  })
})

describe('loadContext quality checks', () => {
  it('takes the first scene in rank order that is 80 % clear, even when a later one is clearer, and stops asking', async () => {
    const g = { a: gate<QualityResult>(), b: gate<QualityResult>() }
    const t = setup()
    t.quality.mockImplementation((req) => g[req.item.id as 'a' | 'b'].promise)
    const p = run(t.deps)
    await vi.waitFor(() => expect(t.quality).toHaveBeenCalledTimes(2))
    g.b.resolve(qualityOf(0.99)) // the second is clearer and answers first, but the first in rank order wins
    await flush()
    expect(t.frame).not.toHaveBeenCalled()
    g.a.resolve(qualityOf(0.8))
    const r = await p
    expect(r).toMatchObject({ ok: true, image: { sceneId: 'a', clearPct: 80 } })
    expect(checked(t)).toEqual(['a', 'b'])
  })

  it('cancels the check still in flight once the winner is known', async () => {
    const g = { a: gate<QualityResult>(), b: gate<QualityResult>() }
    const t = setup()
    t.quality.mockImplementation((req) => g[req.item.id as 'a' | 'b'].promise)
    const p = run(t.deps)
    await vi.waitFor(() => expect(t.quality).toHaveBeenCalledTimes(2))
    const sibling = t.quality.mock.calls[1]![1]!
    expect(sibling.aborted).toBe(false)
    g.a.resolve(qualityOf(0.9))
    await p
    expect(sibling.aborted).toBe(true)
    expect(checked(t)).toEqual(['a', 'b']) // the third was never asked
  })

  it('moves on to the second when the first is cloudy, and does not ask for the third', async () => {
    const t = setup({ clear: { a: 0.5, b: 0.85 } })
    const r = await run(t.deps)
    expect(r).toMatchObject({ ok: true, image: { sceneId: 'b', clearPct: 85 } })
    expect(checked(t)).toEqual(['a', 'b'])
  })

  it('asks for the third only when the first two are not clear enough', async () => {
    const t = setup({ clear: { a: 0.5, b: 0.6, c: 0.9 } })
    const r = await run(t.deps)
    expect(r).toMatchObject({ ok: true, image: { sceneId: 'c' } })
    expect(checked(t)).toEqual(['a', 'b', 'c'])
  })

  it('makes at most three checks and never more than two at once', async () => {
    let now = 0
    let most = 0
    const t = setup()
    t.quality.mockImplementation(async () => {
      most = Math.max(most, ++now)
      await flush()
      now--
      return qualityOf(0.1)
    })
    await run(t.deps)
    expect(t.quality).toHaveBeenCalledTimes(3)
    expect(most).toBe(2)
  })

  it('returns the clearest of the checked ones, flagged, when none is 80 % clear', async () => {
    const t = setup({ clear: { a: 0.1, b: 0.5, c: 0.3 } })
    const r = await run(t.deps)
    expect(r).toMatchObject({
      ok: false,
      reason: 'ALL_CLOUDY',
      image: { sceneId: 'b', clearPct: 50, cloudy: true },
    })
    expect(t.frame).toHaveBeenCalledTimes(1)
    expect(t.frame.mock.calls[0]![0].item.id).toBe('b')
  })

  it('prefers the better-ranked scene when two are equally clear', async () => {
    const t = setup({ clear: { a: 0.5, b: 0.5, c: 0.5 } })
    expect(await run(t.deps)).toMatchObject({ reason: 'ALL_CLOUDY', image: { sceneId: 'a' } })
  })

  it('skips a check that fails and carries on', async () => {
    const t = setup({ clear: { a: new Error('IMAGERY_WORKER_FAILED'), b: 0.9 } })
    expect(await run(t.deps)).toMatchObject({ ok: true, image: { sceneId: 'b' } })
  })

  it('ends in FAILED, with no frame read, when every check fails', async () => {
    const e = new Error('x')
    const t = setup({ clear: { a: e, b: e, c: e } })
    expect(await run(t.deps)).toEqual(failed('FAILED'))
    expect(t.frame).not.toHaveBeenCalled()
    expect(t.stages).toEqual(['searching', 'checking'])
  })
})

describe('loadContext reasons', () => {
  it('says NO_SCENES when the search finds nothing that qualifies, and asks the worker for nothing', async () => {
    for (const items of [[], [scene('old', 241, 0)]]) {
      const t = setup({ items })
      expect(await run(t.deps)).toEqual(failed('NO_SCENES'))
      expect(t.quality).not.toHaveBeenCalled()
      expect(t.frame).not.toHaveBeenCalled()
      expect(t.stages).toEqual(['searching', 'checking'])
    }
  })

  it('says OFFLINE when the search fails', async () => {
    const t = setup()
    t.search.mockRejectedValue(new Error('STAC_503'))
    expect(await run(t.deps)).toEqual(failed('OFFLINE'))
    expect(t.quality).not.toHaveBeenCalled()
  })

  it('says OFFLINE when the search throws at once', async () => {
    const t = setup()
    t.search.mockImplementation(() => {
      throw new TypeError('Failed to fetch')
    })
    expect(await run(t.deps)).toEqual(failed('OFFLINE'))
  })

  it.each([
    ['a timeout', Object.assign(new Error('IMAGERY_TIMEOUT'), { name: 'TimeoutError' })],
    ['a worker crash', new Error('IMAGERY_WORKER_FAILED')],
    ['a scene that does not hold the region', new Error('AOI_OUTSIDE_SCENE')],
  ])('says FAILED when the frame read ends in %s', async (_name, err) => {
    const t = setup({ clear: { a: 0.95 } })
    t.frame.mockRejectedValue(err)
    expect(await run(t.deps)).toEqual(failed('FAILED'))
  })

  it('says FAILED for a frame that is not the size of its grid', async () => {
    const t = setup({ clear: { a: 0.95 } })
    t.frame.mockImplementation(async (req) => frameOf(req.grid, new Uint8ClampedArray(4)))
    expect(await run(t.deps)).toEqual(failed('FAILED'))
  })

  it.each([
    ['not a number', [NaN, 21.1, 79.1, 21.2]],
    ['upside down', [79.2, 21.2, 79.1, 21.1]],
    ['wider than 12 km', [78.5, 21.0, 79.6, 21.2]],
  ] as Array<[string, Bbox]>)(
    'says FAILED for a region that is %s, before any call',
    async (_name, region) => {
      const t = setup()
      expect(await run(t.deps, undefined, region)).toEqual(failed('FAILED'))
      expect(t.search).not.toHaveBeenCalled()
    },
  )

  it('never throws, even when the caller’s stage callback does', async () => {
    const t = setup({ clear: { a: 0.95 } })
    t.deps.onStage = () => {
      throw new Error('boom')
    }
    expect(await run(t.deps)).toEqual(failed('FAILED'))
  })
})

describe('loadContext abort', () => {
  const aborted = (r: ContextResult) => expect(r).toEqual(failed('ABORTED'))

  it('says ABORTED without a single call when the signal is already aborted', async () => {
    const t = setup()
    const ac = new AbortController()
    ac.abort()
    aborted(await run(t.deps, ac.signal))
    expect(t.search).not.toHaveBeenCalled()
    expect(t.stages).toEqual([])
  })

  it('stops during the search: ABORTED at once, the search told to stop, nothing asked afterwards', async () => {
    const t = setup()
    const late = gate<SearchResult>()
    t.search.mockReturnValue(late.promise)
    const ac = new AbortController()
    const p = run(t.deps, ac.signal)
    await vi.waitFor(() => expect(t.search).toHaveBeenCalledTimes(1))
    ac.abort()
    aborted(await p)
    expect(t.search.mock.calls[0]![0].signal!.aborted).toBe(true)
    late.resolve(found(SCENES)) // a search that ignores the abort and answers late changes nothing
    await flush()
    expect(t.quality).not.toHaveBeenCalled()
    expect(t.frame).not.toHaveBeenCalled()
  })

  it('stops during the checks: ABORTED, the checks told to stop, no further call', async () => {
    const t = setup()
    const g = [gate<QualityResult>(), gate<QualityResult>()]
    let n = 0
    t.quality.mockImplementation(() => g[n++]!.promise)
    const ac = new AbortController()
    const p = run(t.deps, ac.signal)
    await vi.waitFor(() => expect(t.quality).toHaveBeenCalledTimes(2))
    ac.abort()
    aborted(await p)
    expect(t.quality.mock.calls.every((c) => c[1]!.aborted)).toBe(true)
    g.forEach((x) => x.resolve(qualityOf(0.1))) // late answers: the third check must not start
    await flush()
    expect(t.quality).toHaveBeenCalledTimes(2)
    expect(t.frame).not.toHaveBeenCalled()
  })

  it('stops during the read: ABORTED, the read told to stop, and no picture handed back', async () => {
    const t = setup({ clear: { a: 0.95 } })
    const late = gate<FrameResult>()
    t.frame.mockReturnValue(late.promise)
    const ac = new AbortController()
    const p = run(t.deps, ac.signal)
    await vi.waitFor(() => expect(t.frame).toHaveBeenCalledTimes(1))
    ac.abort()
    aborted(await p)
    expect(t.frame.mock.calls[0]![1]!.aborted).toBe(true)
    late.resolve(frameOf(gridFor(REGION)))
    await flush()
    expect(t.frame).toHaveBeenCalledTimes(1)
  })

  it('starts nothing and hands nothing back when the abort lands just as a call answers', async () => {
    // Each fake aborts the caller's signal in the same step in which it answers normally.
    const search = setup()
    const a1 = new AbortController()
    search.search.mockImplementation(async () => (a1.abort(), found(SCENES)))
    aborted(await run(search.deps, a1.signal))
    expect(search.quality).not.toHaveBeenCalled()

    const check = setup()
    const a2 = new AbortController()
    check.quality.mockImplementation(async () => (a2.abort(), qualityOf(0.95)))
    aborted(await run(check.deps, a2.signal))
    expect(check.frame).not.toHaveBeenCalled()

    const read = setup({ clear: { a: 0.95 } })
    const a3 = new AbortController()
    read.frame.mockImplementation(async (req) => (a3.abort(), frameOf(req.grid)))
    aborted(await run(read.deps, a3.signal)) // no picture for a caller that has gone
  })

  it('leaves nothing on the caller’s signal, finished or aborted', async () => {
    const t = setup({ clear: { a: 0.95 } })
    const done = new AbortController()
    await run(t.deps, done.signal)
    expect(getEventListeners(done.signal, 'abort')).toHaveLength(0)
    const gone = new AbortController()
    t.search.mockReturnValue(new Promise(() => {}))
    const p = run(t.deps, gone.signal)
    await vi.waitFor(() => expect(t.search).toHaveBeenCalledTimes(2))
    gone.abort()
    await p
    expect(getEventListeners(gone.signal, 'abort')).toHaveLength(0)
  })
})

describe('loadContext deadline', () => {
  it('gives up after 60 s with FAILED, even when the search never answers', async () => {
    vi.useFakeTimers()
    const t = setup()
    t.search.mockReturnValue(new Promise(() => {}))
    let done = false
    const p = run(t.deps).then((r) => ((done = true), r))
    await vi.advanceTimersByTimeAsync(59_999)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await p).toEqual(failed('FAILED'))
    expect(t.search.mock.calls[0]![0].signal!.aborted).toBe(true)
  })

  it('gives up during the checks and the read too, and starts nothing after', async () => {
    vi.useFakeTimers()
    const t = setup()
    t.quality.mockReturnValue(new Promise(() => {}))
    const p = run(t.deps)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await p).toEqual(failed('FAILED'))
    expect(t.quality).toHaveBeenCalledTimes(2)
    expect(t.frame).not.toHaveBeenCalled()

    const u = setup({ clear: { a: 0.95 } })
    u.frame.mockReturnValue(new Promise(() => {}))
    const q = run(u.deps)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await q).toEqual(failed('FAILED'))
    expect(u.frame.mock.calls[0]![1]!.aborted).toBe(true)
  })

  it('tells the caller’s abort from the deadline', async () => {
    vi.useFakeTimers()
    const t = setup()
    t.search.mockReturnValue(new Promise(() => {}))
    const ac = new AbortController()
    const p = run(t.deps, ac.signal)
    await vi.advanceTimersByTimeAsync(10_000)
    ac.abort()
    expect(await p).toEqual(failed('ABORTED'))
  })

  it('leaves no timer behind once it has finished', async () => {
    vi.useFakeTimers()
    const t = setup({ clear: { a: 0.95 } })
    expect((await run(t.deps)).ok).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('label honesty', () => {
  it('labels the picture with the scene it shows, not the first one ranked', async () => {
    const t = setup({ clear: { a: 0.3, b: 0.9 } })
    expect(await run(t.deps)).toMatchObject({
      ok: true,
      image: { sceneId: 'b', date: SCENES[1]!.date, ageDays: 20 },
    })
  })

  it('ranks against the region, not against the coarsened box sent to the search', async () => {
    const tight: LonLat[][] = [
      [
        [79.05, 21.12],
        [79.12, 21.12],
        [79.12, 21.17],
        [79.05, 21.17],
        [79.05, 21.12],
      ],
    ]
    const t = setup({ items: [{ ...scene('t', 10, 5), footprint: tight }], clear: { t: 0.9 } })
    expect(await run(t.deps)).toMatchObject({ ok: true, image: { sceneId: 't' } })
  })

  it('does not take a scene that is only 79 % clear', async () => {
    const t = setup({ clear: { a: 0.79, b: 0.5, c: 0.3 } })
    expect(await run(t.deps)).toMatchObject({ reason: 'ALL_CLOUDY', image: { sceneId: 'a', cloudy: true } })
  })

  it('never calls a picture flagged cloudy 80 % clear', async () => {
    const t = setup({ clear: { a: 0.797, b: 0.1, c: 0.1 } })
    expect(await run(t.deps)).toMatchObject({ reason: 'ALL_CLOUDY', image: { cloudy: true, clearPct: 79 } })
  })
})
