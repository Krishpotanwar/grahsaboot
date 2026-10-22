// What the tests of the time-lapse loader (src/explore/load*.test.ts) share: one square, one catalogue of scenes across six years,
// and a fake search and imagery client that log every call, count the requests in flight and can be held, slowed or made to fail.
import { vi } from 'vitest'
import type { SeasonPlan, TimeLapseDeps, YearResult } from '../../src/explore/load.ts'
import type { DisplayGrid, LonLat } from '../../src/evidence/types.ts'
import { bboxOf, type Bbox } from '../../src/geo/aoi.ts'
import { squareAround } from '../../src/geo/square.ts'
import { parseItem } from '../../src/stac/parse.ts'
import type { SearchArgs } from '../../src/stac/search.ts'
import type { S2Item, SearchResult } from '../../src/stac/types.ts'
import type {
  FrameRequest,
  FrameResult,
  QualityRequest,
  QualityResult,
} from '../../src/workers/imagery-core.ts'
import { fixtureItem } from './scene.ts'

/** The day of the visit. Its last 12 months hold one dense clear stretch, around 11 February 2026. */
export const NOW = new Date('2026-08-20T12:00:00Z')
/** About 2 km a side near Navi Mumbai; the catalogue is told [73, 18.9, 73.1, 19]. */
export const SQUARE: Bbox = bboxOf(squareAround(73.05, 18.95, 2000))
/** The years of the strip, oldest first: the span is 6, and 2026 is the year of the last frame. */
export const YEARS = [2021, 2022, 2023, 2024, 2025, 2026]

export const idOf = (date: string) => `S2B_43QBB_${date.replaceAll('-', '')}_0_L2A`
/** Of a year before 2026: the best candidate (the middle day), the next one, and one that would be a third check. */
export const best = (y: number) => idOf(`${y}-02-11`)
export const next = (y: number) => idOf(`${y}-02-18`)
export const third = (y: number) => idOf(`${y}-02-03`)
/** The last frame and the candidates after it, newest first: the clear stretch of 2026. */
export const LAST = idOf('2026-03-03')
export const LAST_NEXT = idOf('2026-02-21')
export const LAST_THIRD = idOf('2026-02-11')

// One parsed fixture scene is the template, as in the other loader tests: a field added to S2Item later needs no change here.
const TEMPLATE = parseItem(
  fixtureItem('https://sentinel-cogs.s3.us-west-2.amazonaws.com', {
    date: '2025-01-10',
    scl: () => 5,
    roof: false,
    cloud: 0,
  }),
  'sentinel-2-l2a',
)!
const COVERS: LonLat[][] = [
  [
    [72.9, 18.8],
    [73.2, 18.8],
    [73.2, 19.1],
    [72.9, 19.1],
    [72.9, 18.8],
  ],
]
const ELSEWHERE: LonLat[][] = [
  [
    [10, 10],
    [11, 10],
    [11, 11],
    [10, 11],
    [10, 10],
  ],
]
/** A scene as the catalogue lists it: 05:30 UTC on `date`, covering the square unless `footprint` says otherwise. */
export const scene = (date: string, cloudCover: number | null, over: Partial<S2Item> = {}): S2Item => ({
  ...TEMPLATE,
  id: idOf(date),
  datetime: `${date}T05:30:00Z`,
  date,
  cloudCover,
  footprint: COVERS,
  ...over,
})
export const found = (items: S2Item[]): SearchResult => ({ items, limited: false, source: 'sentinel-2-l2a' })

/**
 * Six years of one place. The clear stretch of the last 12 months (22 Jan to 3 Mar 2026, five scenes ten days apart) makes
 * 11 February the target day; 3 March, 21 February, 11 February... are the candidates of the last frame, newest first. Each earlier
 * year has three scenes inside its window of 41 days (best 11 Feb at 4%, next 18 Feb at 9%, third 3 Feb at 12%), a perfect scene
 * outside the window, and a perfect one inside it that does not cover the square: none of those two may ever be checked.
 */
export function catalogue(): S2Item[] {
  const items: S2Item[] = [
    scene('2026-01-22', 7),
    scene('2026-02-01', 5),
    scene('2026-02-11', 2),
    scene('2026-02-21', 6),
    scene('2026-03-03', 4),
    scene('2026-03-08', 1, { footprint: ELSEWHERE }),
    scene('2025-09-10', 85),
    scene('2026-06-15', 80),
    scene('2026-08-10', 75),
  ]
  for (const y of [2021, 2022, 2023, 2024, 2025])
    items.push(
      scene(`${y}-02-03`, 12),
      scene(`${y}-02-11`, 4),
      scene(`${y}-02-18`, 9),
      scene(`${y}-02-12`, 0, { footprint: ELSEWHERE }),
      scene(`${y}-04-20`, 0),
    )
  return items
}

export interface Gate<T = void> {
  promise: Promise<T>
  resolve(v: T): void
  reject(e: unknown): void
}
export const gate = <T = void>(): Gate<T> => {
  const g = {} as Gate<T>
  g.promise = new Promise<T>((res, rej) => {
    g.resolve = res
    g.reject = rej
  })
  return g
}
/** Lets what is waiting on a settled promise run: by the clock when it is a fake one. */
export const flush = (): Promise<unknown> =>
  vi.isFakeTimers() ? vi.advanceTimersByTimeAsync(0) : new Promise((r) => setTimeout(r, 5))

/** Moves the fake clock on until `p` has settled (a macrotask turn at every step, as a real load has). */
export async function drive<T>(p: Promise<T>): Promise<T> {
  let done = false
  void p.then(
    () => (done = true),
    () => (done = true),
  )
  for (let i = 0; !done && i < 4_000; i++) await vi.advanceTimersByTimeAsync(100)
  return p
}

const abortError = () => new DOMException('Aborted', 'AbortError')
/** What a well-behaved dependency does with a signal: refuses a signal that has gone and rejects when it fires. */
const honouring = <T>(
  signal: AbortSignal | undefined,
  work: () => Promise<T>,
  onEnd = () => {},
): Promise<T> => {
  if (signal?.aborted) return Promise.reject(abortError())
  return new Promise<T>((resolve, reject) => {
    let open = true
    const close = () => {
      if (open) onEnd()
      open = false
    }
    signal?.addEventListener(
      'abort',
      () => {
        close()
        reject(abortError())
      },
      { once: true },
    )
    work().then(
      (v) => {
        close()
        resolve(v)
      },
      (e) => {
        close()
        reject(e)
      },
    )
  })
}

export interface Options {
  items?: S2Item[]
  /** The clear share of the square by scene id (default 0.9); an Error makes that check fail. */
  clear?: Record<string, number | Error>
  /** A frame read that fails, by scene id. */
  readFails?: Record<string, Error>
  slowLink?: boolean
  /** Every check and every read takes this long (on the fake clock). */
  latency?: number
}

/** The fake search and imagery client, and everything the tests read off them. */
export function world(over: Options = {}) {
  const items = over.items ?? catalogue()
  /** Every call and event in the order it happened: `search <from>`, `quality <id>`, `frame <id>`, `season`, `year <year>`. */
  const log: string[] = []
  const gates = new Map<string, Gate>()
  /** Requests in flight to the picture host now, and at the most. */
  const seen = { now: 0, peak: 0 }
  const masks = new Map<string, Uint8Array>()
  const pixels = new Map<string, Uint8ClampedArray>()
  const heard: YearResult[] = []
  const seasons: SeasonPlan[] = []
  const held = (key: string) => gates.get(key)?.promise
  const slow = () => (over.latency ? new Promise<void>((r) => setTimeout(r, over.latency)) : undefined)
  const request = <T>(signal: AbortSignal | undefined, work: () => Promise<T>) =>
    honouring(
      signal,
      () => {
        seen.now++
        seen.peak = Math.max(seen.peak, seen.now)
        return work()
      },
      () => {
        seen.now--
      },
    )

  const search = vi.fn((a: SearchArgs) =>
    honouring(a.signal, async () => {
      log.push(`search ${a.from}`)
      await held(`search ${a.from}`)
      return found(items.filter((s) => s.date >= a.from && s.date <= a.to))
    }),
  )
  const quality = vi.fn((req: QualityRequest, signal?: AbortSignal) =>
    request(signal, async () => {
      log.push(`quality ${req.item.id}`)
      if (!req.grid) throw new Error('NO_GRID') // the loader must ask for the mask: it passes the display grid
      await held(`quality ${req.item.id}`)
      await slow()
      const v = over.clear?.[req.item.id] ?? 0.9
      if (v instanceof Error) throw v
      const invalid = new Uint8Array(req.grid.width * req.grid.height).fill(1 + (masks.size % 200))
      masks.set(req.item.id, invalid)
      return {
        window: [0, 0, 1, 1],
        level: 0,
        sha256: 'q'.repeat(64),
        stats: { clearFraction: v },
        parts: [],
        invalid,
      } as unknown as QualityResult
    }),
  )
  const frame = vi.fn((req: FrameRequest, signal?: AbortSignal) =>
    request(signal, async () => {
      log.push(`frame ${req.item.id}`)
      await held(`frame ${req.item.id}`)
      await slow()
      const bad = over.readFails?.[req.item.id]
      if (bad) throw bad
      const rgba = new Uint8ClampedArray(req.grid.width * req.grid.height * 4).fill(1 + (pixels.size % 200))
      pixels.set(req.item.id, rgba)
      return {
        window: [0, 0, 1, 1],
        level: req.level,
        sha256: 'f'.repeat(64),
        native: { width: 2, height: 2, rgb: new Uint8Array(12) },
        display: { width: req.grid.width, height: req.grid.height, rgba },
      } as unknown as FrameResult
    }),
  )
  const deps: TimeLapseDeps = {
    search,
    client: { quality, frame },
    now: NOW,
    slowLink: over.slowLink,
    onSeason: (s) => (log.push('season'), seasons.push(s)),
    onYear: (y) => (log.push(`year ${y.year}`), heard.push(y)),
  }
  return {
    deps,
    search,
    quality,
    frame,
    log,
    seen,
    heard,
    seasons,
    /** Holds the call that `key` names (`search <from>`, `quality <id>`, `frame <id>`) until the gate is resolved. */
    hold: (key: string): Gate => (gates.set(key, gate()), gates.get(key)!),
    maskOf: (id: string) => masks.get(id),
    pixelsOf: (id: string) => pixels.get(id),
    /** The signal a check or a read of this scene was given (the first call). */
    signalOf: (op: 'quality' | 'frame', id: string): AbortSignal | undefined =>
      (op === 'quality' ? quality : frame).mock.calls.find((c) => c[0].item.id === id)?.[1],
    ids: (op: 'quality' | 'frame') =>
      (op === 'quality' ? quality : frame).mock.calls.map((c) => c[0].item.id),
    grid: (): DisplayGrid => quality.mock.calls[0]![0].grid!,
  }
}
export type World = ReturnType<typeof world>
