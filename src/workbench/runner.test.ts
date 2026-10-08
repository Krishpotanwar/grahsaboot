import { describe, expect, it, vi } from 'vitest'
import { isUsable } from './defaults.ts'
import { createRunner, interleaveEnds, type EvidenceState, type RunnerDeps } from './runner.ts'
import type { DateCandidate, S2Item } from '../stac/types.ts'

const item = (date: string) => ({ id: date, date }) as unknown as S2Item
const cand = (date: string): DateCandidate => ({ date, item: item(date), alternates: [], coversAoi: true })
const DATES = ['2025-01-10', '2025-03-05', '2025-06-15', '2025-12-20']
const LABEL: Record<string, string> = {
  '2025-01-10': 'CLEAR',
  '2025-03-05': 'PARTIAL',
  '2025-06-15': 'OBSCURED',
  '2025-12-20': 'CLEAR',
}
const grid = { width: 4, height: 4 } as never
const input = {
  aoi: { kind: 'site', rings: [] } as never,
  bbox: [0, 0, 1, 1] as [number, number, number, number],
  points: [],
  dateFrom: '2025-01-01',
  dateTo: '2025-12-31',
  grid,
  thumbGrid: grid,
  priority: [] as string[],
}

function deps(over: Partial<RunnerDeps> = {}) {
  const calls: string[] = []
  const d: RunnerDeps = {
    search: async () => ({ items: DATES.map(item), limited: false, source: 'sentinel-2-l2a' }),
    select: () => DATES.map(cand),
    quality: async (req) => {
      calls.push(`q:${req.item.id}`)
      return { stats: { label: LABEL[req.item.id], validFraction: 1 } } as never
    },
    frame: async (req) => {
      calls.push(`f${req.level}:${req.item.id}`)
      return { level: req.level } as never
    },
    ...over,
  }
  return { d, calls }
}
const flush = () => new Promise((r) => setTimeout(r, 0))
const settle = async () => {
  for (let i = 0; i < 20; i++) await flush()
}
/** A promise that stays pending until `open()` is called. */
const gate = () => {
  let open!: () => void
  const held = new Promise<void>((r) => (open = r))
  return { held, open }
}
/** Rejects the way a fetch does when `signal` aborts. */
const whenAborted = (signal: AbortSignal) =>
  new Promise<never>((_res, rej) =>
    signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))),
  )

describe('interleaveEnds', () => {
  it('orders from both ends inward', () => {
    expect(interleaveEnds(['a', 'b', 'c', 'd', 'e'])).toEqual(['a', 'e', 'b', 'd', 'c'])
  })
})

describe('createRunner', () => {
  it('checks every date, then loads thumbnails only for clear/partial ones', async () => {
    const { d, calls } = deps()
    let last = null as EvidenceState | null
    const r = createRunner(d, input, (s) => (last = s), 1)
    await r.start()
    for (let i = 0; i < 20; i++) await flush()
    expect(calls.filter((c) => c.startsWith('q:'))).toEqual([
      'q:2025-01-10',
      'q:2025-12-20',
      'q:2025-03-05',
      'q:2025-06-15',
    ])
    expect(calls.filter((c) => c.startsWith('f1:')).sort()).toEqual([
      'f1:2025-01-10',
      'f1:2025-03-05',
      'f1:2025-12-20',
    ])
    expect(last!.entries.every((e) => e.status === 'checked')).toBe(true)
  })
  it('loads an eager thumbnail in its own check turn, not at the back of the sweep', async () => {
    const { d, calls } = deps()
    const r = createRunner(d, input, () => {}, 1)
    await r.start()
    await settle()
    // One place at a time: each usable date's preview follows its own check. Queued behind the sweep it would also block
    // `requestThumb` for that date, and the date on show would keep its skeleton for as long as the sweep takes.
    expect(calls).toEqual([
      'q:2025-01-10',
      'f1:2025-01-10',
      'q:2025-12-20',
      'f1:2025-12-20',
      'q:2025-03-05',
      'f1:2025-03-05',
      'q:2025-06-15',
    ])
  })
  it('runs 6 checks at once by default, and no more', async () => {
    const MANY = Array.from({ length: 10 }, (_, i) => `2025-02-${String(i + 1).padStart(2, '0')}`)
    const { held, open } = gate()
    let live = 0
    let peak = 0
    const { d } = deps({
      search: async () => ({ items: MANY.map(item), limited: false, source: 'sentinel-2-l2a' }),
      select: () => MANY.map(cand),
      quality: async () => {
        peak = Math.max(peak, ++live)
        await held
        live--
        return { stats: { label: 'OBSCURED', validFraction: 1 } } as never
      },
    })
    const r = createRunner(d, input, () => {}) // the default concurrency
    await r.start()
    await settle()
    expect(peak).toBe(6)
    open()
    await settle()
    expect(live).toBe(0) // the other 4 ran after the first 6, so all 10 were checked
  })
  it('honours priority dates and `only`', async () => {
    const { d, calls } = deps()
    const r = createRunner(
      d,
      { ...input, priority: ['2025-06-15'], only: ['2025-06-15', '2025-12-20'] },
      () => {},
      1,
    )
    await r.start()
    for (let i = 0; i < 20; i++) await flush()
    expect(calls.filter((c) => c.startsWith('q:'))).toEqual(['q:2025-06-15', 'q:2025-12-20'])
  })
  it('loads full frames on request, ahead of queued work', async () => {
    const { d, calls } = deps()
    const r = createRunner(d, input, () => {}, 1)
    await r.start()
    r.requestFull('2025-12-20')
    for (let i = 0; i < 20; i++) await flush()
    expect(calls).toContain('f0:2025-12-20')
    expect(calls.indexOf('f0:2025-12-20')).toBeLessThan(calls.indexOf('q:2025-06-15'))
  })
  it('reports search failures and empty results distinctly', async () => {
    let s = null as EvidenceState | null
    await createRunner(
      deps({
        search: async () => {
          throw new Error('STAC_502')
        },
      }).d,
      input,
      (x) => (s = x),
    ).start()
    expect(s).toMatchObject({ phase: 'error', error: 'STAC_502' })
    await createRunner(deps({ select: () => [] }).d, input, (x) => (s = x)).start()
    expect(s).toMatchObject({ phase: 'ready', entries: [] })
  })
  it('stops all work and state updates after dispose', async () => {
    const onState = vi.fn()
    const slow: RunnerDeps['quality'] = (_req, signal) =>
      new Promise((_res, rej) =>
        signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))),
      )
    const r = createRunner(deps({ quality: slow }).d, input, onState, 2)
    await r.start()
    const n = onState.mock.calls.length
    r.dispose()
    for (let i = 0; i < 10; i++) await flush()
    expect(onState.mock.calls.length).toBe(n)
  })

  it('loads a full frame once, however often it is requested', async () => {
    const { d, calls } = deps()
    const { held, open } = gate()
    const frame: RunnerDeps['frame'] = async (req) => {
      calls.push(`f${req.level}:${req.item.id}`)
      if (req.level === 0) await held
      return { level: req.level } as never
    }
    const r = createRunner({ ...d, frame }, input, () => {}, 2)
    await r.start()
    r.requestFull('2025-12-20')
    r.requestFull('2025-12-20')
    await settle()
    open()
    await settle()
    r.requestFull('2025-12-20')
    await settle()
    expect(calls.filter((c) => c === 'f0:2025-12-20')).toHaveLength(1)
  })
  it('does not request a failed full frame again until retry(date), and a success clears the error', async () => {
    const { d, calls } = deps()
    let broken = true
    const frame: RunnerDeps['frame'] = async (req) => {
      calls.push(`f${req.level}:${req.item.id}`)
      if (req.level === 0 && broken) throw new Error('COG_500')
      return { level: req.level } as never
    }
    let last = null as EvidenceState | null
    const r = createRunner({ ...d, frame }, input, (s) => (last = s), 1)
    const entryOf = (date: string) => last!.entries.find((x) => x.date === date)!
    await r.start()
    r.requestFull('2025-12-20')
    await settle()
    expect(entryOf('2025-12-20')).toMatchObject({ error: 'COG_500', full: null })
    r.requestFull('2025-12-20')
    await settle()
    expect(calls.filter((c) => c === 'f0:2025-12-20')).toHaveLength(1)
    broken = false
    r.retry('2025-12-20')
    await settle()
    expect(calls.filter((c) => c === 'f0:2025-12-20')).toHaveLength(2)
    expect(entryOf('2025-12-20')).toMatchObject({ error: null, full: { level: 0 } })
  })
  it('shows a failed check as an error; retry(date) checks it again, ahead of queued work', async () => {
    const { d, calls } = deps()
    const { held, open } = gate()
    let broken = true
    const quality: RunnerDeps['quality'] = async (req) => {
      calls.push(`q:${req.item.id}`)
      if (broken && req.item.id === '2025-01-10') throw new Error('SCL_TIMEOUT')
      if (req.item.id === '2025-12-20') await held
      return { stats: { label: LABEL[req.item.id], validFraction: 1 } } as never
    }
    let last = null as EvidenceState | null
    const r = createRunner({ ...d, quality }, input, (s) => (last = s), 1)
    const entryOf = (date: string) => last!.entries.find((x) => x.date === date)!
    await r.start()
    await settle() // 01-10 has failed, 12-20 holds the only slot, 03-05 and 06-15 wait
    expect(entryOf('2025-01-10')).toMatchObject({ status: 'error', error: 'SCL_TIMEOUT', quality: null })
    broken = false
    r.retry('2025-01-10')
    r.retry('2025-01-10') // already queued: no second check
    open()
    await settle()
    expect(calls.filter((c) => c.startsWith('q:'))).toEqual([
      'q:2025-01-10',
      'q:2025-12-20',
      'q:2025-01-10',
      'q:2025-03-05',
      'q:2025-06-15',
    ])
    expect(entryOf('2025-01-10')).toMatchObject({ status: 'checked', error: null })
  })
  it('loads thumbnails by itself for the first 12 usable dates only; requestThumb loads any other usable date, once', async () => {
    const MANY = Array.from({ length: 15 }, (_, i) => `2025-02-${String(i + 1).padStart(2, '0')}`)
    const order = interleaveEnds(MANY)
    const obscured = new Set([order[1]!, order[3]!]) // two early checks that give no thumbnail
    const usable = order.filter((x) => !obscured.has(x)) // 13 usable dates, in check order
    const late = usable[12]!
    const { held, open } = gate()
    const { d, calls } = deps({
      search: async () => ({ items: MANY.map(item), limited: false, source: 'sentinel-2-l2a' }),
      select: () => MANY.map(cand),
      quality: async (req) =>
        ({ stats: { label: obscured.has(req.item.id) ? 'OBSCURED' : 'CLEAR', validFraction: 1 } }) as never,
      frame: async (req) => {
        calls.push(`f${req.level}:${req.item.id}`)
        if (req.level === 1 && req.item.id === late) await held
        return { level: req.level } as never
      },
    })
    const r = createRunner(d, input, () => {}, 2)
    await r.start()
    await settle()
    const thumbs = () => calls.filter((c) => c.startsWith('f1:'))
    expect(thumbs().sort()).toEqual(
      usable
        .slice(0, 12)
        .map((x) => `f1:${x}`)
        .sort(),
    )
    r.requestThumb([...obscured][0]!) // not usable
    r.requestThumb(late)
    r.requestThumb(late) // still loading
    r.requestThumb(usable[0]!) // already has one
    await settle()
    expect(thumbs()).toHaveLength(13)
    open()
    await settle()
    r.requestThumb(late) // loaded
    await settle()
    expect(thumbs().filter((c) => c === `f1:${late}`)).toHaveLength(1)
  })
  it('records a failed thumbnail, keeps the date usable, and loads it again only on retry(date)', async () => {
    const { d, calls } = deps()
    let broken = true
    const frame: RunnerDeps['frame'] = async (req) => {
      calls.push(`f${req.level}:${req.item.id}`)
      if (req.level === 1 && broken && req.item.id === '2025-03-05') throw new Error('COG_500')
      return { level: req.level } as never
    }
    let last = null as EvidenceState | null
    const r = createRunner({ ...d, frame }, input, (s) => (last = s), 1)
    const entryOf = (date: string) => last!.entries.find((x) => x.date === date)!
    await r.start()
    await settle()
    expect(entryOf('2025-03-05')).toMatchObject({
      thumbFailed: true,
      thumb: null,
      status: 'checked',
      error: null,
    })
    expect(isUsable(entryOf('2025-03-05'))).toBe(true)
    r.requestThumb('2025-03-05')
    await settle()
    expect(calls.filter((c) => c === 'f1:2025-03-05')).toHaveLength(1)
    broken = false
    r.retry('2025-03-05')
    await settle()
    expect(entryOf('2025-03-05')).toMatchObject({ thumbFailed: false, thumb: { level: 1 } })
  })
  it('checks carry no grid; requestFull adds one call with the grid and keeps its mask on the entry', async () => {
    const mask = new Uint8Array([1, 0, 0, 1])
    const seen: Array<{ id: string; grid: unknown }> = []
    const { d } = deps({
      quality: async (req) => {
        seen.push({ id: req.item.id, grid: req.grid })
        return {
          stats: { label: LABEL[req.item.id], validFraction: 1 },
          invalid: req.grid ? mask : undefined,
        } as never
      },
    })
    let last = null as EvidenceState | null
    const r = createRunner(d, input, (s) => (last = s), 2)
    const entryOf = (date: string) => last!.entries.find((x) => x.date === date)!
    await r.start()
    await settle()
    expect(seen).toHaveLength(4)
    expect(seen.every((c) => c.grid === undefined)).toBe(true)
    expect(last!.entries.every((x) => x.invalid === null)).toBe(true)
    r.requestFull('2025-12-20')
    await settle()
    expect(seen).toHaveLength(5)
    expect(seen[4]!.grid).toBe(grid)
    expect(entryOf('2025-12-20').invalid).toEqual(mask)
    expect(entryOf('2025-01-10').invalid).toBeNull()
  })
  it('runs the search again on retry() after a search error, and only then', async () => {
    let searches = 0
    const { d } = deps({
      search: async () => {
        if (++searches === 1) throw new Error('STAC_502')
        return { items: DATES.map(item), limited: false, source: 'sentinel-2-l2a' }
      },
    })
    const states: EvidenceState[] = []
    const r = createRunner(d, input, (s) => states.push(s), 1)
    await r.start()
    expect(states.at(-1)).toMatchObject({ phase: 'error', error: 'STAC_502' })
    r.retry()
    expect(states.at(-1)).toMatchObject({ phase: 'searching', error: null })
    await settle()
    expect(states.at(-1)).toMatchObject({ phase: 'ready', error: null })
    expect(states.at(-1)!.entries).toHaveLength(4)
    expect(searches).toBe(2)
    r.retry()
    await settle()
    expect(searches).toBe(2)
  })
  describe('requestCheck', () => {
    /** The only slot is held by the first check, so every other date waits in the queue. */
    function held01() {
      const { d, calls } = deps()
      const { held, open } = gate()
      const quality: RunnerDeps['quality'] = async (req) => {
        calls.push(`q:${req.item.id}`)
        if (req.item.id === '2025-01-10') await held
        return { stats: { label: LABEL[req.item.id], validFraction: 1 } } as never
      }
      return { d: { ...d, quality }, calls, open }
    }
    const asked = (calls: string[]) => calls.filter((c) => c.startsWith('q:'))

    it('checks a date that is still queued next, ahead of the dates before it', async () => {
      const { d, calls, open } = held01()
      const r = createRunner(d, input, () => {}, 1)
      await r.start()
      r.requestCheck('2025-06-15') // the last date of the sweep
      open()
      await settle()
      expect(asked(calls)).toEqual(['q:2025-01-10', 'q:2025-06-15', 'q:2025-12-20', 'q:2025-03-05'])
    })
    it('makes one quality request per date, however often it is called or when', async () => {
      const { d, calls, open } = held01()
      const r = createRunner(d, input, () => {}, 1)
      await r.start()
      r.requestCheck('2025-01-10') // its own check is already running
      r.requestCheck('2025-06-15')
      r.requestCheck('2025-06-15') // already asked for
      open()
      await settle()
      r.requestCheck('2025-06-15') // already checked
      await settle()
      expect(asked(calls)).toHaveLength(4)
      expect(calls.filter((c) => c === 'q:2025-01-10')).toHaveLength(1)
      expect(calls.filter((c) => c === 'q:2025-06-15')).toHaveLength(1)
    })
    it('does nothing for a failed, an unknown or a disposed date; retry(date) is the way back for a failure', async () => {
      const { d, calls } = deps()
      const quality: RunnerDeps['quality'] = async (req) => {
        calls.push(`q:${req.item.id}`)
        if (req.item.id === '2025-01-10') throw new Error('SCL_500')
        return { stats: { label: LABEL[req.item.id], validFraction: 1 } } as never
      }
      let last = null as EvidenceState | null
      const r = createRunner({ ...d, quality }, input, (s) => (last = s), 1)
      await r.start()
      await settle()
      expect(last!.entries[0]).toMatchObject({ date: '2025-01-10', status: 'error' })
      r.requestCheck('2025-01-10')
      r.requestCheck('1999-01-01')
      await settle()
      expect(asked(calls)).toHaveLength(4)

      const b = held01()
      const gone = createRunner(b.d, input, () => {}, 1)
      await gone.start()
      gone.dispose()
      gone.requestCheck('2025-06-15')
      b.open()
      await settle()
      expect(asked(b.calls)).toEqual(['q:2025-01-10'])
    })
  })
  it('does nothing after dispose, whatever is requested or retried', async () => {
    const onState = vi.fn()
    let searches = 0
    const failing = deps({
      search: async () => {
        searches++
        throw new Error('STAC_502')
      },
    })
    const a = createRunner(failing.d, input, onState, 1)
    await a.start()
    a.dispose()
    const n = onState.mock.calls.length
    a.retry()
    await settle()
    expect(searches).toBe(1)
    expect(onState.mock.calls.length).toBe(n)

    const checked: string[] = []
    const { d, calls } = deps({
      quality: async (req) => {
        checked.push(req.item.id)
        if (req.item.id === '2025-01-10') throw new Error('SCL_500')
        return { stats: { label: LABEL[req.item.id], validFraction: 1 } } as never
      },
    })
    const onState2 = vi.fn()
    const b = createRunner(d, input, onState2, 1)
    await b.start()
    await settle()
    b.dispose()
    const counts = () => [checked.length, calls.length, onState2.mock.calls.length]
    const before = counts()
    b.retry('2025-01-10')
    b.requestFull('2025-12-20')
    await settle()
    expect(counts()).toEqual(before)
  })
})

/**
 * A search that answers a one-day call (`from === to`) at once with that day's pass, and the whole range with all of DATES.
 * `ctl` steers it: the range waits on `full`, a day on `days`; a `bad` day fails, an `empty` day finds nothing, `failFull` fails the range.
 * With `abortable` a search that is waiting also ends, as an abort, when the runner is disposed.
 */
function pairDeps() {
  const searched: Array<[string, string]> = []
  const opened = () => {
    const g = gate()
    g.open()
    return g
  }
  const ctl = {
    full: gate(),
    days: opened(),
    bad: new Set<string>(),
    empty: new Set<string>(),
    failFull: false,
    abortable: false,
    fullDates: DATES,
  }
  const { d, calls } = deps({
    search: async (a) => {
      searched.push([a.from, a.to])
      const day = a.from === a.to
      const held = (day ? ctl.days : ctl.full).held
      await (ctl.abortable ? Promise.race([held, whenAborted(a.signal)]) : held)
      if (day ? ctl.bad.has(a.from) : ctl.failFull) throw new Error(day ? 'STAC_500' : 'STAC_502')
      const items = day ? (ctl.empty.has(a.from) ? [] : [item(a.from)]) : ctl.fullDates.map(item)
      return { items, limited: false, source: 'sentinel-2-l2a' }
    },
    select: (items) => [...new Set(items.map((i) => i.date))].sort().map(cand),
  })
  return { d, calls, searched, ctl }
}
const PAIR = ['2025-01-10', '2025-12-20']
const asked = (calls: string[]) => calls.filter((c) => c.startsWith('q:'))
const daysOf = (searched: Array<[string, string]>) => searched.filter(([a, b]) => a === b).map(([a]) => a)
const rangeOf = (searched: Array<[string, string]>) => searched.filter(([a, b]) => a !== b)
const datesOf = (s: EvidenceState | null) => s!.entries.map((e) => e.date)

describe('pair first', () => {
  const withPair = { ...input, priority: PAIR }

  it('shows the known days, and starts their checks, while the whole range is still being searched', async () => {
    const { d, calls, searched, ctl } = pairDeps()
    const states: EvidenceState[] = []
    const run = createRunner(d, withPair, (s) => states.push(s), 1).start()
    await settle()
    const first = states.find((s) => s.entries.length)
    expect(first).toMatchObject({ phase: 'ready', more: true, limited: false, source: 'sentinel-2-l2a' })
    expect(datesOf(first!)).toEqual(PAIR)
    expect(asked(calls)).toEqual(['q:2025-01-10', 'q:2025-12-20'])
    expect(rangeOf(searched)).toEqual([['2025-01-01', '2025-12-31']])
    ctl.full.open()
    await run
  })

  it('keeps the early entries as they are when the whole list arrives, and checks no date twice', async () => {
    const { d, calls, ctl } = pairDeps()
    let last = null as EvidenceState | null
    const run = createRunner(d, withPair, (s) => (last = s), 1).start()
    await settle()
    const early = last!.entries
    expect(early.map((e) => [e.date, e.status])).toEqual([
      ['2025-01-10', 'checked'],
      ['2025-12-20', 'checked'],
    ])
    ctl.full.open()
    await run
    await settle()
    expect(last).toMatchObject({ phase: 'ready', more: false, error: null })
    expect(datesOf(last)).toEqual(DATES)
    for (const e of early) expect(last!.entries.find((x) => x.date === e.date)).toBe(e) // the same object, quality and all
    expect(last!.entries.every((e) => e.status === 'checked')).toBe(true)
    expect(asked(calls)).toEqual(['q:2025-01-10', 'q:2025-12-20', 'q:2025-03-05', 'q:2025-06-15'])
  })

  it('loads a full frame for an early entry on request, and keeps it when the whole list arrives', async () => {
    const { d, ctl } = pairDeps()
    let last = null as EvidenceState | null
    const r = createRunner(d, withPair, (s) => (last = s), 1)
    const run = r.start()
    await settle()
    r.requestFull('2025-01-10')
    await settle()
    const early = last!.entries[0]!
    expect(early).toMatchObject({ date: '2025-01-10', full: { level: 0 } })
    ctl.full.open()
    await run
    await settle()
    expect(last!.entries[0]).toBe(early)
  })

  it('keeps an early date the whole search did not return', async () => {
    const { d, ctl } = pairDeps()
    ctl.fullDates = DATES.slice(0, 3) // without 20 Dec
    let last = null as EvidenceState | null
    const run = createRunner(d, withPair, (s) => (last = s), 1).start()
    await settle()
    ctl.full.open()
    await run
    await settle()
    expect(datesOf(last)).toEqual(DATES)
    expect(last).toMatchObject({ phase: 'ready', more: false })
  })

  it.each([
    ['fail', 'bad'],
    ['find nothing', 'empty'],
  ] as const)(
    'ignores first-day searches that %s: no early list, no error, the whole list arrives',
    async (_how, kind) => {
      const { d, ctl } = pairDeps()
      for (const day of PAIR) ctl[kind].add(day)
      const states: EvidenceState[] = []
      const run = createRunner(d, withPair, (s) => states.push(s), 1).start()
      await settle()
      expect(states).toEqual([])
      ctl.full.open()
      await run
      await settle()
      expect(states.some((s) => s.more || s.phase === 'error')).toBe(false)
      expect(states.at(-1)).toMatchObject({ phase: 'ready', more: false })
      expect(datesOf(states.at(-1)!)).toEqual(DATES)
    },
  )

  it('shows the days that were found when another first-day search fails', async () => {
    const { d, ctl } = pairDeps()
    ctl.bad.add('2025-12-20')
    let last = null as EvidenceState | null
    const run = createRunner(d, withPair, (s) => (last = s), 1).start()
    await settle()
    expect(last).toMatchObject({ phase: 'ready', more: true })
    expect(datesOf(last)).toEqual(['2025-01-10'])
    ctl.full.open()
    await run
    await settle()
    expect(datesOf(last)).toEqual(DATES)
  })

  it('drops the early list when the whole one has arrived first, or the whole search has failed', async () => {
    for (const failFull of [false, true]) {
      const { d, ctl } = pairDeps()
      ctl.days = gate()
      ctl.full.open()
      ctl.failFull = failFull
      const states: EvidenceState[] = []
      await createRunner(d, withPair, (s) => states.push(s), 1).start()
      await settle()
      const n = states.length
      ctl.days.open()
      await settle()
      expect(states.length).toBe(n) // the early list came too late and changed nothing
      expect(states.some((s) => s.more)).toBe(false)
      expect(states.at(-1)).toMatchObject(
        failFull ? { phase: 'error', more: false } : { phase: 'ready', more: false },
      )
    }
  })

  it('keeps the early entries when the whole search fails; retry() searches again and merges', async () => {
    const { d, calls, searched, ctl } = pairDeps()
    ctl.failFull = true
    const states: EvidenceState[] = []
    const r = createRunner(d, withPair, (s) => states.push(s), 1)
    const run = r.start()
    await settle()
    ctl.full.open()
    await run
    await settle()
    const failed = states.at(-1)!
    expect(failed).toMatchObject({ phase: 'error', error: 'STAC_502', more: false })
    expect(datesOf(failed)).toEqual(PAIR)
    expect(failed.entries.every((e) => e.quality)).toBe(true)
    ctl.failFull = false
    ctl.full = gate()
    r.retry()
    await settle()
    expect(states.at(-1)).toMatchObject({ phase: 'ready', more: true, error: null })
    ctl.full.open()
    await settle()
    const last = states.at(-1)!
    expect(last).toMatchObject({ phase: 'ready', more: false, error: null })
    expect(datesOf(last)).toEqual(DATES)
    for (const e of failed.entries) expect(last.entries.find((x) => x.date === e.date)).toBe(e)
    expect(daysOf(searched)).toEqual([...PAIR, ...PAIR])
    expect(rangeOf(searched)).toHaveLength(2)
    expect(asked(calls)).toEqual(['q:2025-01-10', 'q:2025-12-20', 'q:2025-03-05', 'q:2025-06-15'])
  })

  it.each([[[]], [['2024-12-31', '2026-01-01']]])(
    'searches only the whole range when no known day lies inside it (%j)',
    async (priority) => {
      const { d, searched, ctl } = pairDeps()
      ctl.full.open()
      const states: EvidenceState[] = []
      await createRunner(d, { ...input, priority }, (s) => states.push(s), 1).start()
      expect(searched).toEqual([['2025-01-01', '2025-12-31']])
      expect(states.some((s) => s.more)).toBe(false)
    },
  )

  it('searches at most the first 6 distinct known days inside the range', async () => {
    const { d, searched, ctl } = pairDeps()
    ctl.full.open()
    const feb = (n: number) => `2025-02-0${n}`
    const priority = ['2025-02-01', '2025-02-01', '2024-12-31', ...[2, 3, 4, 5, 6, 7, 8].map(feb)]
    await createRunner(d, { ...input, priority }, () => {}, 1).start()
    expect(daysOf(searched)).toEqual([1, 2, 3, 4, 5, 6].map(feb))
  })

  it('skips the first list, and carries on, when `select` throws on it', async () => {
    const { d, ctl } = pairDeps()
    // It throws on the one answer per day of the first list only; the whole answer is fine and is what the page shows.
    const select: RunnerDeps['select'] = (items, points) => {
      if (items.length < DATES.length) throw new Error('BAD_ITEM')
      return d.select(items, points)
    }
    const states: EvidenceState[] = []
    const run = createRunner({ ...d, select }, withPair, (s) => states.push(s), 1).start()
    await settle()
    expect(states).toEqual([]) // nothing shown, and nothing wrong yet
    ctl.full.open()
    await run
    expect(states.at(-1)).toMatchObject({ phase: 'ready', more: false, error: null })
    expect(datesOf(states.at(-1)!)).toEqual(DATES)
  })

  it.each(['resolves', 'aborts'] as const)(
    'shows and starts nothing when disposed while the first days are searched, and a search that %s',
    async (how) => {
      const { d, calls, ctl } = pairDeps()
      ctl.days = gate()
      ctl.abortable = how === 'aborts'
      const onState = vi.fn()
      const r = createRunner(d, withPair, onState, 1)
      const run = r.start()
      await settle()
      r.dispose()
      ctl.days.open() // the days end after the runner is gone, then the range
      await settle()
      ctl.full.open()
      await run
      await settle()
      expect(onState).not.toHaveBeenCalled()
      expect(calls).toEqual([]) // no check, no frame
    },
  )
})

describe('only', () => {
  const only = { ...input, only: PAIR }

  it('searches exactly the named days, never the whole range, and is never `more`', async () => {
    const { d, searched, ctl } = pairDeps()
    ctl.full.open()
    const states: EvidenceState[] = []
    // A day outside the dates and a repeated day are not searched.
    const named = ['2025-01-10', '2024-12-31', '2025-12-20', '2025-01-10']
    await createRunner(d, { ...input, only: named }, (s) => states.push(s), 1).start()
    await settle()
    expect(searched).toEqual([
      ['2025-01-10', '2025-01-10'],
      ['2025-12-20', '2025-12-20'],
    ])
    expect(states.every((s) => !s.more)).toBe(true)
    expect(states.at(-1)).toMatchObject({ phase: 'ready', limited: false, source: 'sentinel-2-l2a' })
    expect(datesOf(states.at(-1)!)).toEqual(PAIR)
  })

  it('gives no entry for a day whose search finds no scene', async () => {
    const { d, ctl } = pairDeps()
    ctl.full.open()
    ctl.empty.add('2025-12-20')
    let last = null as EvidenceState | null
    await createRunner(d, only, (s) => (last = s), 1).start()
    expect(last).toMatchObject({ phase: 'ready', more: false })
    expect(datesOf(last)).toEqual(['2025-01-10'])
  })

  it('fails whole when any day fails, and retry() searches the days again', async () => {
    const { d, searched, ctl } = pairDeps()
    ctl.full.open()
    ctl.bad.add('2025-12-20')
    const states: EvidenceState[] = []
    const r = createRunner(d, only, (s) => states.push(s), 1)
    await r.start()
    expect(states.at(-1)).toMatchObject({ phase: 'error', error: 'STAC_500', more: false, entries: [] })
    ctl.bad.clear()
    r.retry()
    await settle()
    expect(states.at(-1)).toMatchObject({ phase: 'ready', error: null, more: false })
    expect(datesOf(states.at(-1)!)).toEqual(PAIR)
    expect(daysOf(searched)).toHaveLength(4)
    expect(rangeOf(searched)).toEqual([])
  })

  it('keeps 6 day searches in flight: when one ends the next starts, and never more than 6 at once', async () => {
    const TEN = Array.from({ length: 10 }, (_, i) => `2025-02-${String(i + 1).padStart(2, '0')}`)
    const gates = new Map<string, ReturnType<typeof gate>>() // one per search, made when it starts
    let live = 0
    let peak = 0
    const { d } = deps({
      search: async (a) => {
        const g = gate()
        gates.set(a.from, g)
        peak = Math.max(peak, ++live)
        await g.held
        live--
        return { items: [item(a.from)], limited: false, source: 'sentinel-2-l2a' }
      },
      select: (items) => items.map((i) => cand(i.date)),
    })
    let last = null as EvidenceState | null
    const run = createRunner(d, { ...input, only: TEN }, (s) => (last = s), 1).start()
    await settle()
    expect([...gates.keys()]).toEqual(TEN.slice(0, 6)) // six start, in order; the other four wait
    for (let done = 1; done <= 10; done++) {
      gates.get(TEN[done - 1]!)!.open() // one search ends: exactly one more starts, until none is left
      await settle()
      expect([...gates.keys()]).toEqual(TEN.slice(0, Math.min(10, 6 + done)))
      expect(live).toBe(Math.min(10, 6 + done) - done)
    }
    await run
    expect(peak).toBe(6)
    expect(datesOf(last)).toEqual(TEN)
    expect(last).toMatchObject({ phase: 'ready', more: false })
  })

  it.each(['resolves', 'aborts'] as const)(
    'shows and starts nothing when disposed while the named days are searched, and a search that %s',
    async (how) => {
      const { d, calls, ctl } = pairDeps()
      ctl.days = gate()
      ctl.abortable = how === 'aborts'
      const onState = vi.fn()
      const r = createRunner(d, only, onState, 1)
      const run = r.start()
      await settle()
      r.dispose()
      ctl.days.open() // the days end after the runner is gone
      await run
      await settle()
      expect(onState).not.toHaveBeenCalled()
      expect(calls).toEqual([]) // no check, no frame
    },
  )

  it('with no days named, searches nothing and is ready with no entries and no checks', async () => {
    const { d, calls, searched, ctl } = pairDeps()
    ctl.full.open()
    let last = null as EvidenceState | null
    await createRunner(d, { ...input, only: [] }, (s) => (last = s), 1).start()
    await settle()
    expect(searched).toEqual([])
    expect(last).toMatchObject({ phase: 'ready', more: false, entries: [] })
    expect(calls).toEqual([])
  })

  it('still checks the named days in priority order', async () => {
    const { d, calls, ctl } = pairDeps()
    ctl.full.open()
    await createRunner(d, { ...only, priority: ['2025-12-20'] }, () => {}, 1).start()
    await settle()
    expect(asked(calls)).toEqual(['q:2025-12-20', 'q:2025-01-10'])
  })
})
