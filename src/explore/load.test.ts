import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  best,
  catalogue,
  drive,
  flush,
  idOf,
  LAST,
  LAST_NEXT,
  LAST_THIRD,
  next,
  NOW,
  scene,
  SQUARE,
  third,
  world,
  YEARS,
  type World,
} from '../../tests/fixtures/explore-load.ts'
import { makeDisplayGrid } from '../evidence/display.ts'
import type { LonLat } from '../evidence/types.ts'
import type { Bbox } from '../geo/aoi.ts'
import type { QualityResult } from '../workers/imagery-core.ts'
import { loadTimeLapse, type TimeLapseFrame, type TimeLapseResult } from './load.ts'

const DAY = 86_400_000
const GRID = makeDisplayGrid(SQUARE, 400, 0)
const run = (w: World, signal: AbortSignal = new AbortController().signal, square: Bbox = SQUARE) =>
  loadTimeLapse(w.deps, square, signal)
const ok = async (w: World) => {
  const r = await run(w)
  if (!r.ok) throw new Error(`the load ended in ${r.reason}`)
  return r
}
const frameOf = (r: Extract<TimeLapseResult, { ok: true }>, year: number): TimeLapseFrame | undefined => {
  const y = r.years.find((x) => x.year === year)
  return y && 'frame' in y ? y.frame : undefined
}
const gapOf = (r: Extract<TimeLapseResult, { ok: true }>, year: number) => {
  const y = r.years.find((x) => x.year === year)
  return y && 'gap' in y ? y.gap : undefined
}
const failed = (reason: string) => ({ ok: false, reason })
/** The scenes of one year that were checked, in the order of the calls. */
const checked = (w: World, year: number) => w.ids('quality').filter((id) => id.includes(`_${year}`))
const timeout = (m: string) => Object.assign(new Error(m), { name: 'TimeoutError' })
afterEach(() => {
  vi.useRealTimers()
})
const HALF: LonLat[][] = [
  [
    [72.9, 18.8],
    [73.05, 18.8],
    [73.05, 19.1],
    [72.9, 19.1],
    [72.9, 18.8],
  ],
]

describe('loadTimeLapse: the last frame (the anchor)', () => {
  it('searches the last 12 months once, with the coarsened square and a signal, before anything else', async () => {
    const w = world()
    await run(w)
    expect(w.log[0]).toBe('search 2025-08-20')
    const first = w.search.mock.calls[0]![0]
    expect(first).toMatchObject({ bbox: [73, 18.9, 73.1, 19], from: '2025-08-20', to: '2026-08-20' })
    expect(first.signal).toBeInstanceOf(AbortSignal)
    expect(w.search.mock.calls.filter((c) => c[0].from === '2025-08-20')).toHaveLength(1)
  })

  it('makes the newest clear scene of the clearest stretch the last frame: read once, labelled with its date, age and clear share', async () => {
    const w = world({ clear: { [LAST]: 0.826 } })
    const r = await ok(w)
    expect(frameOf(r, 2026)).toMatchObject({ sceneId: LAST, date: '2026-03-03', ageDays: 170, clearPct: 83 })
    expect(w.ids('frame').filter((id) => id === LAST)).toHaveLength(1)
  })

  it('checks the best two candidates of the stretch at once, newest first, and never a third', async () => {
    const w = world()
    await run(w)
    const stretch = [LAST, LAST_NEXT, LAST_THIRD]
    expect(w.ids('quality').filter((id) => stretch.includes(id))).toEqual([LAST, LAST_NEXT])
  })

  it('takes the next candidate when the newest is under 80% clear', async () => {
    const w = world({ clear: { [LAST]: 0.7, [LAST_NEXT]: 0.95 } })
    expect(frameOf(await ok(w), 2026)).toMatchObject({ sceneId: LAST_NEXT, date: '2026-02-21', clearPct: 95 })
  })

  it('counts only scenes that hold the whole square: the corners of the square are what it asks', async () => {
    // newer and perfect, but one is outside the square's area altogether and the other holds only its western corners
    const items = [
      ...catalogue(),
      scene('2026-03-06', 1, { footprint: HALF }),
      scene('2026-03-07', 0, { footprint: HALF }),
    ]
    const w = world({ items })
    const r = await ok(w)
    expect(frameOf(r, 2026)?.sceneId).toBe(LAST)
    expect(w.ids('quality')).not.toContain(idOf('2026-03-08'))
    expect(w.ids('quality')).not.toContain(idOf('2026-03-06'))
  })

  it('announces the season before the first check: the display grid, the target day and the 6 years, oldest first', async () => {
    const w = world()
    const r = await ok(w)
    expect(w.seasons).toEqual([{ grid: GRID, monthDay: '02-11', years: YEARS }])
    expect(w.log.indexOf('season')).toBeGreaterThan(w.log.indexOf('search 2025-08-20'))
    expect(w.log.indexOf('season')).toBeLessThan(w.log.indexOf(`quality ${LAST}`))
    expect(r).toMatchObject({ grid: GRID, monthDay: '02-11' })
  })

  it('emits the last frame the moment it is read, and starts the earlier years only after it', async () => {
    const w = world()
    await run(w)
    const emitted = w.log.indexOf('year 2026')
    expect(emitted).toBeGreaterThan(w.log.indexOf(`frame ${LAST}`))
    expect(w.log.slice(0, emitted).filter((l) => l.startsWith('search'))).toEqual(['search 2025-08-20'])
    expect(w.log.slice(emitted).filter((l) => l.startsWith('search'))).toHaveLength(5)
  })
})

describe('loadTimeLapse: one display grid, the mask kept, nothing else', () => {
  it('builds one display grid of the square (400 by 400 at 2 km) and gives every check and every read that very grid', async () => {
    const w = world()
    await run(w)
    expect(GRID).toMatchObject({ width: 400, height: 400 })
    const grids = [...w.quality.mock.calls, ...w.frame.mock.calls].map((c) => c[0].grid)
    expect(grids).toHaveLength(12 + 6) // 2 checks for each of the 6 years, and one read for each
    for (const g of grids) expect(g).toEqual(GRID)
    expect(new Set(grids).size).toBe(1) // one object: every frame sits on the same grid
  })

  it('asks for the square as a site, the same ring in every call, and reads at level 0', async () => {
    const [x0, y0, x1, y1] = SQUARE
    const ring = [
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
      ],
    ]
    const w = world()
    await run(w)
    const asked = [...w.quality.mock.calls, ...w.frame.mock.calls]
    expect(asked).toHaveLength(12 + 6)
    for (const c of asked) expect(c[0].aoi).toEqual({ kind: 'site', rings: ring })
    expect(w.frame.mock.calls).toHaveLength(6)
    for (const c of w.frame.mock.calls) expect(c[0].level).toBe(0)
  })

  it('keeps the display pixels and the mask of the winner, and drops the native pixels, the hash and the other check', async () => {
    const w = world()
    const r = await ok(w)
    const f = frameOf(r, 2023)!
    expect(Object.keys(f).sort()).toEqual(['ageDays', 'clearPct', 'date', 'invalid', 'rgba', 'sceneId'])
    expect(f.rgba).toBe(w.pixelsOf(best(2023)))
    expect(f.invalid).toBe(w.maskOf(best(2023)))
    expect(f.rgba).toHaveLength(400 * 400 * 4)
    expect(f.invalid).toHaveLength(400 * 400) // one byte per display pixel
    expect(f.invalid).not.toBe(w.maskOf(next(2023)))
    for (const y of YEARS) expect(Object.keys(frameOf(r, y)!)).not.toContain('native')
  })

  it('labels each frame with the scene it shows: its id, date and age', async () => {
    const w = world({ clear: { [best(2024)]: 0.3, [next(2024)]: 0.9 } })
    const r = await ok(w)
    expect(frameOf(r, 2024)).toMatchObject({ sceneId: next(2024), date: '2024-02-18', clearPct: 90 })
    const age = Math.floor((NOW.getTime() - Date.parse('2025-02-11T05:30:00Z')) / DAY)
    expect(frameOf(r, 2025)).toMatchObject({ sceneId: best(2025), date: '2025-02-11', ageDays: age })
  })
})

describe('loadTimeLapse: the five earlier years', () => {
  it.each([[false], [true]])(
    'starts the five yearly searches together once the last frame is there: one window of 41 days each, the same coarsened square (slow link %s)',
    async (slowLink) => {
      const w = world({ slowLink })
      const hold = YEARS.slice(0, 5).map((y) => w.hold(`search ${y}-01-22`))
      const p = run(w)
      await vi.waitFor(() => expect(w.search).toHaveBeenCalledTimes(6)) // all five asked while none has answered
      expect(w.log.indexOf('year 2026')).toBeLessThan(w.log.indexOf('search 2021-01-22'))
      const windows = w.search.mock.calls.slice(1).map((c) => `${c[0].from} ${c[0].to}`)
      expect(windows.sort()).toEqual([
        '2021-01-22 2021-03-03',
        '2022-01-22 2022-03-03',
        '2023-01-22 2023-03-03',
        '2024-01-22 2024-03-02', // 2024 has a 29 February
        '2025-01-22 2025-03-03',
      ])
      for (const c of w.search.mock.calls.slice(1)) {
        expect(c[0].bbox).toEqual([73, 18.9, 73.1, 19])
        expect(c[0].signal).toBeInstanceOf(AbortSignal)
      }
      hold.forEach((g) => g.resolve())
      expect((await p).ok).toBe(true)
    },
  )

  it('loads the oldest year next and then the rest from the oldest, emitting each frame as it arrives', async () => {
    const w = world({ slowLink: true }) // one year at a time: the order is plain
    const r = await ok(w)
    expect(w.ids('frame')).toEqual([LAST, best(2021), best(2022), best(2023), best(2024), best(2025)])
    expect(w.heard.map((y) => y.year)).toEqual([2026, 2021, 2022, 2023, 2024, 2025])
    expect(r.years.map((y) => y.year)).toEqual(YEARS) // the result is in time order, whatever the order of arrival
    expect(r.years.every((y) => 'frame' in y)).toBe(true)
  })

  it('checks the candidates of a year in rank order: only scenes inside its window that hold the square, never a third', async () => {
    const w = world()
    await run(w)
    for (const y of [2021, 2022, 2023, 2024, 2025]) {
      expect(checked(w, y)).toEqual([best(y), next(y)]) // not the perfect scene outside the window, nor the one that does not hold the square
      expect(w.ids('quality')).not.toContain(third(y))
      expect(w.ids('quality')).not.toContain(idOf(`${y}-04-20`))
      expect(w.ids('quality')).not.toContain(idOf(`${y}-02-12`))
    }
  })

  it('asks for the best two candidates of a year at once', async () => {
    const w = world({ slowLink: true })
    const hold = [w.hold(`quality ${best(2021)}`), w.hold(`quality ${next(2021)}`)]
    const p = run(w)
    await vi.waitFor(() => expect(checked(w, 2021)).toEqual([best(2021), next(2021)]))
    expect(w.seen.now).toBe(2) // both are in flight, neither has answered
    hold.forEach((g) => g.resolve())
    await p
  })

  it('takes the first candidate in rank order that is 80% clear even when the second is clearer, and waits for it', async () => {
    const w = world({ slowLink: true, clear: { [best(2021)]: 0.8, [next(2021)]: 0.99 } })
    const first = w.hold(`quality ${best(2021)}`)
    const p = run(w)
    await vi.waitFor(() => expect(checked(w, 2021)).toContain(next(2021)))
    await flush() // the second has answered by now, with 99%
    expect(w.ids('frame').filter((id) => id.includes('_2021'))).toEqual([]) // and the first, which ranks higher, is still awaited
    first.resolve()
    const r = await p
    expect(r.ok && frameOf(r, 2021)).toMatchObject({ sceneId: best(2021), clearPct: 80 }) // exactly 80% is clear enough
    expect(w.ids('frame')).not.toContain(next(2021))
  })

  it('cancels the other check when the first is clear enough, and does not wait for it', async () => {
    const w = world({ slowLink: true })
    w.hold(`quality ${next(2021)}`) // the second never answers
    const p = run(w)
    await vi.waitFor(() => expect(w.ids('frame')).toContain(best(2021)))
    expect(w.signalOf('quality', next(2021))!.aborted).toBe(true)
    expect((await p).ok).toBe(true)
  })

  it('moves on to the second candidate when the first is under 80% clear', async () => {
    const w = world({ clear: { [best(2021)]: 0.5, [next(2021)]: 0.85 } })
    const r = await ok(w)
    expect(frameOf(r, 2021)).toMatchObject({ sceneId: next(2021), clearPct: 85 })
    expect(checked(w, 2021)).toEqual([best(2021), next(2021)])
  })

  it('makes a year a labelled gap, never another season, when neither candidate is 80% clear', async () => {
    const w = world({ clear: { [best(2022)]: 0.5, [next(2022)]: 0.79, [third(2022)]: 1 } })
    const r = await ok(w)
    expect(gapOf(r, 2022)).toBe('no-clear-picture')
    expect(w.ids('frame').filter((id) => id.includes('_2022'))).toEqual([])
    expect(w.ids('quality')).not.toContain(third(2022)) // the third candidate is never looked at
    expect(r.years.map((y) => y.year)).toEqual(YEARS) // the gap is in the strip, in its place
    expect(w.heard.find((y) => y.year === 2022)).toEqual({ year: 2022, gap: 'no-clear-picture' }) // and was emitted
  })

  it('makes a year with no scene of its own a labelled gap and asks the worker for nothing', async () => {
    const w = world({ items: catalogue().filter((s) => !s.date.startsWith('2023-')) })
    const r = await ok(w)
    expect(gapOf(r, 2023)).toBe('no-clear-picture')
    expect(checked(w, 2023)).toEqual([])
    expect(r.years.filter((y) => 'frame' in y)).toHaveLength(5)
  })
})

describe('loadTimeLapse: why the load ends at the last frame', () => {
  it('says NO_SCENES when the search finds nothing, and asks the worker for nothing', async () => {
    const w = world({ items: [] })
    expect(await run(w)).toEqual(failed('NO_SCENES'))
    expect(w.search).toHaveBeenCalledTimes(1)
    expect(w.quality).not.toHaveBeenCalled()
    expect(w.frame).not.toHaveBeenCalled()
    expect(w.heard).toEqual([])
  })

  it('says NO_SCENES when no scene holds the whole square, however clear they are', async () => {
    const items = [scene('2026-02-11', 0, { footprint: HALF }), scene('2026-03-03', 0, { footprint: HALF })]
    const w = world({ items })
    expect(await run(w)).toEqual(failed('NO_SCENES'))
    expect(w.quality).not.toHaveBeenCalled()
  })

  it('says ALL_CLOUDY when no scene of the last 12 months has 20% cloud or less, and starts no yearly search', async () => {
    const w = world({ items: catalogue().map((s) => ({ ...s, cloudCover: 60 })) })
    expect(await run(w)).toEqual(failed('ALL_CLOUDY'))
    expect(w.search).toHaveBeenCalledTimes(1)
    expect(w.quality).not.toHaveBeenCalled()
  })

  it('says ALL_CLOUDY when the two candidates are under 80% clear over the square, with no read and no yearly search', async () => {
    const w = world({ clear: { [LAST]: 0.5, [LAST_NEXT]: 0.79, [LAST_THIRD]: 1 } })
    expect(await run(w)).toEqual(failed('ALL_CLOUDY'))
    expect(w.frame).not.toHaveBeenCalled()
    expect(w.ids('quality')).toEqual([LAST, LAST_NEXT])
    expect(w.search).toHaveBeenCalledTimes(1)
    expect(w.heard).toEqual([])
  })

  it('says OFFLINE when the search fails, whether it rejects or throws at once', async () => {
    const w = world()
    w.search.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await run(w)).toEqual(failed('OFFLINE'))
    const v = world()
    v.search.mockImplementation(() => {
      throw new TypeError('Failed to fetch')
    })
    expect(await run(v)).toEqual(failed('OFFLINE'))
    for (const x of [w, v]) {
      expect(x.quality).not.toHaveBeenCalled()
      expect(x.seasons).toEqual([])
    }
  })

  it('says FAILED, with no read and no yearly search, when every check of the last frame fails', async () => {
    const dead = new Error('IMAGERY_WORKER_FAILED')
    const w = world({ clear: { [LAST]: dead, [LAST_NEXT]: dead } })
    expect(await run(w)).toEqual(failed('FAILED'))
    expect(w.frame).not.toHaveBeenCalled()
    expect(w.search).toHaveBeenCalledTimes(1)
  })

  it('says FAILED when the last frame cannot be read, and starts no yearly search', async () => {
    const w = world({ readFails: { [LAST]: new Error('IMAGERY_WORKER_FAILED') } })
    expect(await run(w)).toEqual(failed('FAILED'))
    expect(w.search).toHaveBeenCalledTimes(1)
    expect(w.heard).toEqual([])
  })

  it.each([
    ['no mask', (q: QualityResult) => ({ ...q, invalid: undefined })],
    ['a mask of the wrong size', (q: QualityResult) => ({ ...q, invalid: new Uint8Array(7) })],
  ])(
    'says FAILED for a check that answers with %s: a picture without its mask cannot be compared',
    async (_n, spoil) => {
      const w = world()
      const real = w.quality.getMockImplementation()!
      w.quality.mockImplementation(async (req, signal) => spoil(await real(req, signal)))
      expect(await run(w)).toEqual(failed('FAILED')) // not ALL_CLOUDY: nothing was said about the cloud
      expect(w.frame).not.toHaveBeenCalled()
    },
  )

  it('says FAILED for a frame that is not the size of the grid', async () => {
    const w = world()
    const real = w.frame.getMockImplementation()!
    w.frame.mockImplementation(async (req, signal) => {
      const f = await real(req, signal)
      return { ...f, display: { ...f.display, rgba: new Uint8ClampedArray(4) } }
    })
    expect(await run(w)).toEqual(failed('FAILED'))
  })

  it.each([
    ['not a number', [NaN, 18.9, 73.1, 19]],
    ['an infinite one', [73, 18.9, Infinity, 19]],
    ['upside down', [73.1, 19, 73, 18.9]],
    ['empty', [73, 18.9, 73, 19]],
    ['bigger than the time-lapse takes (over 10 km)', [73, 18.9, 73.12, 19]],
  ] as Array<[string, Bbox]>)('says FAILED for a square that is %s, before any call', async (_n, square) => {
    const w = world()
    expect(await run(w, new AbortController().signal, square)).toEqual(failed('FAILED'))
    expect(w.search).not.toHaveBeenCalled()
    expect(w.log).toEqual([])
  })

  it('says FAILED for a day of now that is not a day, instead of throwing', async () => {
    const w = world()
    w.deps.now = new Date('not a date')
    expect(await run(w)).toEqual(failed('FAILED'))
    expect(w.search).not.toHaveBeenCalled()
  })
})

describe('loadTimeLapse: a year that cannot be had says why', () => {
  const searchFails = (w: World, from: string, error: Error) => {
    const real = w.search.getMockImplementation()!
    w.search.mockImplementation((a) => {
      if (a.from === from) return Promise.reject(error)
      return real(a)
    })
  }

  it('makes a year whose search fails "offline" and loads the others', async () => {
    const w = world()
    searchFails(w, '2023-01-22', new TypeError('Failed to fetch'))
    const r = await ok(w)
    expect(gapOf(r, 2023)).toBe('offline')
    expect(checked(w, 2023)).toEqual([])
    expect(r.years.filter((y) => 'frame' in y).map((y) => y.year)).toEqual([2021, 2022, 2024, 2025, 2026])
  })

  it('keeps a failed search of a year that is not reached yet from being an unhandled rejection', async () => {
    vi.useFakeTimers() // the years go one after another, each over many turns of the event loop: 2025 fails long before its turn
    const w = world({ slowLink: true, latency: 100 })
    searchFails(w, '2025-01-22', new Error('STAC_503'))
    const r = await drive(run(w))
    expect(r.ok && gapOf(r, 2025)).toBe('offline')
  })

  it('makes a year whose search throws at once "offline"', async () => {
    const w = world()
    const real = w.search.getMockImplementation()!
    w.search.mockImplementation((a) => {
      if (a.from === '2022-01-22') throw new TypeError('Failed to fetch')
      return real(a)
    })
    expect(gapOf(await ok(w), 2022)).toBe('offline')
  })

  it.each([
    ['a failed check', new Error('IMAGERY_WORKER_FAILED'), 'offline'],
    ['a check that timed out on its own', timeout('COG_OPEN_TIMEOUT'), 'timed-out'],
  ] as const)(
    'says %s is %s, and never "no clear picture", when the other candidate is cloudy',
    async (_n, error, gap) => {
      const w = world({ clear: { [best(2021)]: error, [next(2021)]: 0.3 } })
      expect(gapOf(await ok(w), 2021)).toBe(gap)
    },
  )

  it('still takes the other candidate when one check fails and the other is clear', async () => {
    const w = world({ clear: { [best(2021)]: new Error('IMAGERY_WORKER_FAILED'), [next(2021)]: 0.9 } })
    expect(frameOf(await ok(w), 2021)).toMatchObject({ sceneId: next(2021) })
  })

  it.each([
    ['a failed read', new Error('IMAGERY_WORKER_FAILED'), 'offline'],
    ['a read that timed out', timeout('IMAGERY_TIMEOUT'), 'timed-out'],
  ] as const)('makes a year whose clear scene gives %s a gap that says %s', async (_n, error, gap) => {
    const w = world({ readFails: { [best(2022)]: error } })
    const r = await ok(w)
    expect(gapOf(r, 2022)).toBe(gap)
    expect(w.ids('frame')).not.toContain(next(2022)) // the other check was cancelled: there is no third try
  })

  it('makes a year whose frame is not the size of the grid a gap, and says "offline"', async () => {
    const w = world()
    const real = w.frame.getMockImplementation()!
    w.frame.mockImplementation(async (req, signal) => {
      const f = await real(req, signal)
      return req.item.id === best(2024)
        ? { ...f, display: { ...f.display, rgba: new Uint8ClampedArray(4) } }
        : f
    })
    expect(gapOf(await ok(w), 2024)).toBe('offline')
  })

  it('keeps the frames it has when the worker dies, and makes the rest of the years gaps that say "offline"', async () => {
    const w = world({ slowLink: true })
    let dead = false
    const q = w.quality.getMockImplementation()!
    const f = w.frame.getMockImplementation()!
    w.quality.mockImplementation((req, s) =>
      dead ? Promise.reject(new Error('IMAGERY_WORKER_FAILED')) : q(req, s),
    )
    w.frame.mockImplementation((req, s) =>
      dead ? Promise.reject(new Error('IMAGERY_WORKER_FAILED')) : f(req, s),
    )
    const heard = w.deps.onYear!
    w.deps.onYear = (y) => {
      heard(y)
      if (y.year === 2021) dead = true // the worker fails after the last frame and the oldest one
    }
    const r = await ok(w)
    expect(frameOf(r, 2026)?.sceneId).toBe(LAST)
    expect(frameOf(r, 2021)?.sceneId).toBe(best(2021))
    expect(r.years.map((y) => ('gap' in y ? y.gap : 'frame'))).toEqual([
      'frame',
      'offline',
      'offline',
      'offline',
      'offline',
      'frame',
    ])
  })
})
