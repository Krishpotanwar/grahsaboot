import { getEventListeners } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  best,
  catalogue,
  drive,
  flush,
  found,
  LAST,
  LAST_NEXT,
  next,
  NOW,
  SQUARE,
  world,
  YEARS,
  type World,
} from '../../tests/fixtures/explore-load.ts'
import { loadTimeLapse, type TimeLapseResult } from './load.ts'

// The limits of the loader (review answer D15): how many years at once, 90 s for a year and 300 s in all; what an abort leaves;
// that nothing it is given can make it throw. The flow and the labels are in load.test.ts.
const run = (w: World, signal: AbortSignal = new AbortController().signal) =>
  loadTimeLapse(w.deps, SQUARE, signal)
const failed = (reason: string) => ({ ok: false, reason })
const checked = (w: World, year: number) => w.ids('quality').filter((id) => id.includes(`_${year}`))
const calls = (w: World) =>
  w.search.mock.calls.length + w.quality.mock.calls.length + w.frame.mock.calls.length
const kinds = (r: TimeLapseResult) => (r.ok ? r.years.map((y) => ('gap' in y ? y.gap : 'frame')) : [])
afterEach(() => {
  vi.useRealTimers()
})

describe('loadTimeLapse: how many years at once', () => {
  it('loads three years at once on a normal link, and the next one as soon as one is done', async () => {
    const w = world()
    const reads = [2021, 2022, 2023, 2024].map((y) => w.hold(`frame ${best(y)}`))
    const p = run(w)
    await vi.waitFor(() => expect(w.ids('frame')).toEqual([LAST, best(2021), best(2022), best(2023)]))
    await flush()
    expect(checked(w, 2024)).toEqual([]) // a fourth year waits for a place
    expect(checked(w, 2025)).toEqual([])
    expect(w.seen.now).toBe(3) // three reads in flight, no check left over
    reads[0]!.resolve()
    await vi.waitFor(() => expect(checked(w, 2024)).toEqual([best(2024), next(2024)]))
    await flush()
    expect(checked(w, 2025)).toEqual([]) // the fifth waits again: three years are in flight
    reads.forEach((g) => g.resolve())
    expect((await p).ok).toBe(true)
  })

  it('loads one year at a time when the browser reports a slow link', async () => {
    const w = world({ slowLink: true })
    const read = w.hold(`frame ${best(2021)}`)
    const p = run(w)
    await vi.waitFor(() => expect(w.ids('frame')).toContain(best(2021)))
    await flush()
    expect(checked(w, 2022)).toEqual([]) // the second year waits for the first to be done
    expect(w.heard.map((y) => y.year)).toEqual([2026])
    read.resolve()
    expect((await p).ok).toBe(true)
    expect(w.heard.map((y) => y.year)).toEqual([2026, 2021, 2022, 2023, 2024, 2025])
  })

  it('never has more than 6 requests in flight to the picture host: 3 years, 2 checks each', async () => {
    vi.useFakeTimers()
    const w = world({ latency: 100 })
    const r = await drive(run(w))
    expect(r.ok).toBe(true)
    expect(w.frame).toHaveBeenCalledTimes(6)
    expect(w.seen.peak).toBe(6) // all six at the same moment, and never a seventh
  })

  it('has at most 2 requests in flight on a slow link: one year, 2 checks', async () => {
    vi.useFakeTimers()
    const w = world({ latency: 100, slowLink: true })
    expect((await drive(run(w))).ok).toBe(true)
    expect(w.seen.peak).toBe(2)
  })
})

describe('loadTimeLapse: 90 s for a year, 300 s in all', () => {
  it('gives a year up 90 s after its first request: a gap that says "timed-out", and the others are not held back', async () => {
    vi.useFakeTimers()
    const w = world()
    w.hold(`quality ${best(2021)}`)
    w.hold(`quality ${next(2021)}`) // this year never answers
    let result: TimeLapseResult | undefined
    void run(w).then((r) => (result = r))
    await vi.advanceTimersByTimeAsync(89_999)
    expect(result).toBeUndefined()
    expect(w.heard.map((y) => y.year).sort()).toEqual([2022, 2023, 2024, 2025, 2026])
    await vi.advanceTimersByTimeAsync(1)
    expect(result).toMatchObject({ ok: true })
    expect(w.heard.at(-1)).toEqual({ year: 2021, gap: 'timed-out' })
    expect(kinds(result!)).toEqual(['timed-out', 'frame', 'frame', 'frame', 'frame', 'frame'])
    expect(w.signalOf('quality', best(2021))!.aborted).toBe(true)
    expect(w.signalOf('quality', next(2021))!.aborted).toBe(true)
  })

  it.each([
    ['search', 'search 2021-01-22'],
    ['read', `frame ${best(2021)}`],
  ])(
    'gives a year up after 90 s when its %s never answers: "timed-out", and the call is told to stop',
    async (_n, key) => {
      vi.useFakeTimers()
      const w = world()
      w.hold(key)
      let result: TimeLapseResult | undefined
      void run(w).then((r) => (result = r))
      await vi.advanceTimersByTimeAsync(89_999)
      expect(result).toBeUndefined()
      await vi.advanceTimersByTimeAsync(1)
      expect(kinds(result!)).toEqual(['timed-out', 'frame', 'frame', 'frame', 'frame', 'frame'])
      const signal = key.startsWith('search')
        ? w.search.mock.calls[1]![0].signal
        : w.signalOf('frame', best(2021))
      expect(signal!.aborted).toBe(true)
    },
  )

  it('counts the 90 s of a year from its own first request, not from the start of the load', async () => {
    vi.useFakeTimers()
    const w = world({ slowLink: true, latency: 20_000 }) // the last frame is there at 40 s, the oldest year at 80 s
    w.hold(`quality ${best(2022)}`)
    w.hold(`quality ${next(2022)}`) // the second year starts at 80 s and never answers
    let result: TimeLapseResult | undefined
    void run(w).then((r) => (result = r))
    await vi.advanceTimersByTimeAsync(169_999)
    expect(w.heard.map((y) => y.year)).toEqual([2026, 2021]) // not given up at 90 s
    await vi.advanceTimersByTimeAsync(1)
    expect(w.heard.at(-1)).toEqual({ year: 2022, gap: 'timed-out' }) // 80 s + 90 s
    await vi.advanceTimersByTimeAsync(120_000)
    expect(kinds(result!)).toEqual(['frame', 'timed-out', 'frame', 'frame', 'frame', 'frame'])
  })

  it('stops the whole load at 300 s: the frames it has are kept and every year left is a gap that says "timed-out"', async () => {
    vi.useFakeTimers()
    const w = world({ slowLink: true, latency: 40_000 }) // 80 s a year: the last frame at 80, then 160, 240, and 320 would be the fourth
    let result: TimeLapseResult | undefined
    void run(w).then((r) => (result = r))
    await vi.advanceTimersByTimeAsync(299_999)
    expect(result).toBeUndefined()
    expect(w.heard.map((y) => y.year)).toEqual([2026, 2021, 2022])
    await vi.advanceTimersByTimeAsync(1)
    expect(result).toMatchObject({ ok: true })
    expect(kinds(result!)).toEqual(['frame', 'frame', 'timed-out', 'timed-out', 'timed-out', 'frame'])
    expect(w.heard.map((y) => y.year)).toEqual([2026, 2021, 2022, 2023, 2024, 2025]) // the cut years were emitted too
    expect(w.signalOf('frame', best(2023))!.aborted).toBe(true) // the read in flight was told to stop
    expect(checked(w, 2024)).toEqual([]) // and the years that had not started never do
    expect(checked(w, 2025)).toEqual([])
  })

  it.each([
    ['search', ['search 2025-08-20']],
    ['checks', [`quality ${LAST}`, `quality ${LAST_NEXT}`]],
    ['read', [`frame ${LAST}`]],
  ])(
    'ends in FAILED 90 s after the start when the last frame’s %s never answers, and starts no year',
    async (_n, keys) => {
      vi.useFakeTimers()
      const w = world()
      keys.forEach((k) => w.hold(k))
      let result: TimeLapseResult | undefined
      void run(w).then((r) => (result = r))
      await vi.advanceTimersByTimeAsync(89_999)
      expect(result).toBeUndefined()
      await vi.advanceTimersByTimeAsync(1)
      expect(result).toEqual(failed('FAILED')) // not OFFLINE and not ALL_CLOUDY: it ran out of time
      expect(w.search).toHaveBeenCalledTimes(1)
      expect(w.heard).toEqual([])
    },
  )

  it('leaves no timer behind, finished or aborted', async () => {
    vi.useFakeTimers()
    const w = world()
    expect((await run(w)).ok).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    const v = world()
    v.hold(`frame ${best(2022)}`)
    const ac = new AbortController()
    const p = run(v, ac.signal)
    await flush()
    ac.abort()
    expect(await p).toEqual(failed('ABORTED'))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('takes the day of now from the clock when it is not given', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const w = world()
    w.deps.now = undefined
    const r = await run(w)
    expect(r).toMatchObject({ ok: true, monthDay: '02-11' })
    expect(w.search.mock.calls[0]![0]).toMatchObject({ from: '2025-08-20', to: '2026-08-20' })
  })
})

describe('loadTimeLapse: abort', () => {
  const aborted = (r: TimeLapseResult) => expect(r).toEqual(failed('ABORTED'))

  it('says ABORTED without a single call or event when the signal is already aborted', async () => {
    const w = world()
    const ac = new AbortController()
    ac.abort()
    aborted(await run(w, ac.signal))
    expect(w.log).toEqual([])
  })

  it('stops during the search of the last frame: ABORTED at once, the search told to stop, nothing asked afterwards', async () => {
    const w = world()
    const late = w.hold('search 2025-08-20')
    const ac = new AbortController()
    const p = run(w, ac.signal)
    await vi.waitFor(() => expect(w.search).toHaveBeenCalledTimes(1))
    ac.abort()
    aborted(await p)
    expect(w.search.mock.calls[0]![0].signal!.aborted).toBe(true)
    late.resolve() // a search that answers late changes nothing
    await flush()
    expect(w.log).toEqual(['search 2025-08-20'])
  })

  it('stops during the checks of the last frame: ABORTED, the checks told to stop, no read and no event', async () => {
    const w = world()
    const late = [w.hold(`quality ${LAST}`), w.hold(`quality ${LAST_NEXT}`)]
    const ac = new AbortController()
    const p = run(w, ac.signal)
    await vi.waitFor(() => expect(w.quality).toHaveBeenCalledTimes(2))
    ac.abort()
    aborted(await p)
    expect([LAST, LAST_NEXT].every((id) => w.signalOf('quality', id)!.aborted)).toBe(true)
    late.forEach((g) => g.resolve())
    await flush()
    expect(w.quality).toHaveBeenCalledTimes(2)
    expect(w.frame).not.toHaveBeenCalled()
    expect(w.heard).toEqual([])
  })

  it('stops during the read of the last frame: ABORTED, the read told to stop, no picture handed back, no year started', async () => {
    const w = world()
    const late = w.hold(`frame ${LAST}`)
    const ac = new AbortController()
    const p = run(w, ac.signal)
    await vi.waitFor(() => expect(w.frame).toHaveBeenCalledTimes(1))
    ac.abort()
    aborted(await p)
    expect(w.signalOf('frame', LAST)!.aborted).toBe(true)
    late.resolve()
    await flush()
    expect(w.search).toHaveBeenCalledTimes(1)
    expect(w.heard).toEqual([])
  })

  it('stops during the earlier years: ABORTED, every call told to stop, and no call and no event after it', async () => {
    const w = world()
    const late = [2021, 2022, 2023].map((y) => w.hold(`frame ${best(y)}`))
    const ac = new AbortController()
    const p = run(w, ac.signal)
    await vi.waitFor(() => expect(w.ids('frame')).toHaveLength(4))
    ac.abort()
    aborted(await p)
    const [asked, heard] = [calls(w), w.heard.length]
    for (const y of [2021, 2022, 2023]) expect(w.signalOf('frame', best(y))!.aborted).toBe(true)
    for (const c of w.search.mock.calls.slice(1)) expect(c[0].signal!.aborted).toBe(true) // the five yearly searches
    late.forEach((g) => g.resolve()) // late answers: the fourth year must not start, nothing may be emitted
    await flush()
    await flush()
    expect(calls(w)).toBe(asked)
    expect(w.heard).toHaveLength(heard)
  })

  it('starts nothing and hands nothing back when the abort lands just as a call answers', async () => {
    // Each fake aborts the caller's signal in the same step in which it answers normally.
    const onSearch = world()
    const a1 = new AbortController()
    onSearch.search.mockImplementation(async () => (a1.abort(), found(catalogue())))
    aborted(await run(onSearch, a1.signal))
    expect(onSearch.quality).not.toHaveBeenCalled()

    const onCheck = world()
    const a2 = new AbortController()
    const check = onCheck.quality.getMockImplementation()!
    onCheck.quality.mockImplementation(async (req, s) => {
      const v = await check(req, s)
      a2.abort()
      return v
    })
    aborted(await run(onCheck, a2.signal))
    expect(onCheck.frame).not.toHaveBeenCalled()

    const onLast = world()
    const a3 = new AbortController()
    const read = onLast.frame.getMockImplementation()!
    onLast.frame.mockImplementation(async (req, s) => {
      const v = await read(req, s)
      a3.abort()
      return v
    })
    aborted(await run(onLast, a3.signal))
    expect(onLast.heard).toEqual([]) // no picture for a caller that has gone
    expect(onLast.search).toHaveBeenCalledTimes(1)

    const onYear = world({ slowLink: true })
    const a4 = new AbortController()
    const years = onYear.frame.getMockImplementation()!
    onYear.frame.mockImplementation(async (req, s) => {
      const v = await years(req, s)
      if (req.item.id === best(2021)) a4.abort()
      return v
    })
    aborted(await run(onYear, a4.signal))
    expect(onYear.heard.map((y) => y.year)).toEqual([2026]) // the oldest year's frame answered with the abort: not emitted
    expect(checked(onYear, 2022)).toEqual([])
  })

  it('leaves nothing on the caller’s signal, finished or aborted', async () => {
    const w = world()
    const done = new AbortController()
    await run(w, done.signal)
    expect(getEventListeners(done.signal, 'abort')).toHaveLength(0)
    const v = world()
    v.hold(`frame ${best(2021)}`)
    const gone = new AbortController()
    const p = run(v, gone.signal)
    await vi.waitFor(() => expect(v.ids('frame')).toContain(best(2021)))
    gone.abort()
    await p
    expect(getEventListeners(gone.signal, 'abort')).toHaveLength(0)
  })

  it.each([
    ['search', (w: World) => w.search.mockReturnValue(new Promise<never>(() => {}))],
    ['checks', (w: World) => w.quality.mockReturnValue(new Promise<never>(() => {}))],
    ['read', (w: World) => w.frame.mockReturnValue(new Promise<never>(() => {}))],
  ])('is not held back by a %s that ignores its signal and never answers', async (_op, spoil) => {
    const w = world()
    spoil(w)
    const ac = new AbortController()
    const p = run(w, ac.signal)
    await vi.waitFor(() => expect(calls(w)).toBeGreaterThan(0))
    ac.abort()
    aborted(await p)
  })

  it('is not held back, in a later year, by a read that ignores its signal', async () => {
    const w = world({ slowLink: true })
    const real = w.frame.getMockImplementation()!
    w.frame.mockImplementation((req, s) =>
      req.item.id === best(2022) ? new Promise<never>(() => {}) : real(req, s),
    )
    const ac = new AbortController()
    const p = run(w, ac.signal)
    await vi.waitFor(() => expect(w.ids('frame')).toContain(best(2022)))
    ac.abort()
    aborted(await p)
    expect(w.heard.map((y) => y.year)).toEqual([2026, 2021])
  })
})

describe('loadTimeLapse: it never throws', () => {
  it('says FAILED, with nothing more asked, when the caller’s season callback throws', async () => {
    const w = world()
    w.deps.onSeason = () => {
      throw new Error('boom')
    }
    expect(await run(w)).toEqual(failed('FAILED'))
    expect(w.quality).not.toHaveBeenCalled()
  })

  it('says FAILED, and starts no year, when the callback throws for the last frame', async () => {
    const w = world()
    w.deps.onYear = () => {
      throw new Error('boom')
    }
    expect(await run(w)).toEqual(failed('FAILED'))
    expect(w.search).toHaveBeenCalledTimes(1)
  })

  it('says FAILED and then goes quiet when the callback throws for a later year: no call and no event once it has ended', async () => {
    const w = world()
    const heard = w.deps.onYear!
    w.deps.onYear = (y) => {
      heard(y)
      if (y.year === 2021) throw new Error('boom')
    }
    expect(await run(w)).toEqual(failed('FAILED'))
    const [asked, events] = [calls(w), w.heard.length]
    await flush()
    await flush()
    expect(calls(w)).toBe(asked)
    expect(w.heard).toHaveLength(events)
  })

  it('makes a year a gap that says "offline" when its check throws at once, and says FAILED when the last frame’s do', async () => {
    const w = world()
    const real = w.quality.getMockImplementation()!
    w.quality.mockImplementation((req, s) => {
      if (req.item.id.includes('_2022')) throw new TypeError('not a promise')
      return real(req, s)
    })
    const r = await run(w)
    expect(kinds(r)).toEqual(['frame', 'offline', 'frame', 'frame', 'frame', 'frame'])
    const v = world()
    v.quality.mockImplementation(() => {
      throw new TypeError('not a promise')
    })
    expect(await run(v)).toEqual(failed('FAILED'))
  })

  it('makes a year a gap, and the last frame a FAILED, when a read answers with something that is not a frame', async () => {
    const w = world()
    const real = w.frame.getMockImplementation()!
    w.frame.mockImplementation((req, s) =>
      req.item.id === best(2023) ? Promise.resolve(undefined as never) : real(req, s),
    )
    expect(kinds(await run(w))).toEqual(['frame', 'frame', 'offline', 'frame', 'frame', 'frame'])
    const v = world()
    v.frame.mockResolvedValue(null as never)
    expect(await run(v)).toEqual(failed('FAILED'))
  })

  it.each([[undefined], [null], ['boom'], [42], [{ name: 'TimeoutError' }]])(
    'copes with a call that rejects with %j',
    async (reason) => {
      const w = world()
      const real = w.quality.getMockImplementation()!
      w.quality.mockImplementation((req, s) =>
        req.item.id.includes('_2021') ? Promise.reject(reason) : real(req, s),
      )
      const r = await run(w)
      expect(r.ok).toBe(true)
      expect(kinds(r)[0]).toBe(reason && typeof reason === 'object' ? 'timed-out' : 'offline')
    },
  )

  it('hands back a result for every year, whatever the catalogue answers', async () => {
    const w = world({ items: [] })
    expect(await run(w)).toEqual(failed('NO_SCENES'))
    const v = world()
    v.search.mockResolvedValue(found(catalogue()))
    const r = await run(v) // every search answers with every scene: a year only looks at the scenes of its own window
    expect(r.ok && r.years.map((y) => y.year)).toEqual(YEARS)
  })
})
