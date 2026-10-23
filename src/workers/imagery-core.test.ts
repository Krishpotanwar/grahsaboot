import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCogCache, runChange, runFrame, runQuality, type CoreDeps } from './imagery-core.ts'
import { measureChange } from '../evidence/change.ts'
import { fromUtm, makeDisplayGrid, openCogBuffer, sha256Hex, type Cog } from '../evidence/index.ts'
import { parseItem } from '../stac/parse.ts'
import {
  FIXTURE_DATES,
  FIXTURE_ROAD,
  NAGPUR_SQUARE,
  fixtureItem,
  makeScl,
  makeTci,
  toArrayBuffer,
} from '../../tests/fixtures/scene.ts'

const BASE = 'http://127.0.0.1:9'
const files = new Map<string, Uint8Array>()
for (const d of FIXTURE_DATES) {
  files.set(`${BASE}/cog/${d.date}/TCI.tif`, makeTci(d.roof))
  files.set(`${BASE}/cog/${d.date}/SCL.tif`, makeScl(d.scl))
}
const opened: string[] = []
const deps = (): CoreDeps => ({
  openCog: async (href) => {
    opened.push(href)
    return openCogBuffer(toArrayBuffer(files.get(href)!))
  },
})
const item = (date: string) =>
  parseItem(
    fixtureItem(
      BASE,
      FIXTURE_DATES.find((d) => d.date === date)!,
    ),
    'sentinel-2-l2a',
  )!
const SITE = { kind: 'site' as const, rings: [NAGPUR_SQUARE] }
const ROAD = { kind: 'road' as const, line: FIXTURE_ROAD, widthM: 30 }
const GRID = makeDisplayGrid([79.0832, 21.1408, 79.0932, 21.1508], 256)
beforeEach(() => clearCogCache())

describe('runQuality', () => {
  it('labels the fixture dates', async () => {
    const d = deps()
    expect((await runQuality(d, { item: item('2025-01-10'), aoi: SITE })).stats.label).toBe('CLEAR')
    const partial = await runQuality(d, { item: item('2025-03-05'), aoi: SITE })
    expect(partial.stats.label).toBe('PARTIAL')
    expect(partial.stats.validFraction).toBeGreaterThan(0.47)
    expect(partial.stats.validFraction).toBeLessThan(0.54)
    expect((await runQuality(d, { item: item('2025-06-15'), aoi: SITE })).stats.label).toBe('OBSCURED')
  })
  it('returns the SCL window, its hash and per-part stats for roads', async () => {
    const q = await runQuality(deps(), { item: item('2025-12-20'), aoi: ROAD, grid: GRID })
    expect(q.parts.map((p) => [p.fromM, Math.round(p.toM)])).toEqual([
      [0, 2000],
      [2000, 2904],
    ])
    expect(q.parts.every((p) => p.stats.label === 'CLEAR')).toBe(true)
    expect(q.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(q.invalid?.length).toBe(GRID.width * GRID.height)
  })
  it('reports NOT_COVERED when the AOI is outside the scene, with every display pixel invalid', async () => {
    const far = {
      kind: 'site' as const,
      rings: [NAGPUR_SQUARE.map(([x, y]) => [x + 1, y] as [number, number])],
    }
    const q = await runQuality(deps(), { item: item('2025-01-10'), aoi: far, grid: GRID })
    expect(q.stats.label).toBe('NOT_COVERED')
    expect(q.invalid).toHaveLength(GRID.width * GRID.height)
    expect(q.invalid!.every((v) => v === 1)).toBe(true)
    // Fresh objects per result: a caller that edits one must not change another.
    expect(q.stats).not.toBe(q.parts[0]!.stats)
    expect(q.stats.counts).not.toBe(q.parts[0]!.stats.counts)
  })
  // The fixture scene's west edge is x = 300000 m (UTM 44N); the strips straddle it at y 2339500-2340500 (all class 5).
  const strip = (x0: number, x1: number) => ({
    kind: 'site' as const,
    rings: [
      (
        [
          [x0, 2339500],
          [x1, 2339500],
          [x1, 2340500],
          [x0, 2340500],
          [x0, 2339500],
        ] as [number, number][]
      ).map((p) => fromUtm(32644, p)),
    ],
  })
  it('counts the part of the AOI beyond the scene edge as no data: 60 % outside is NOT_COVERED', async () => {
    const { stats } = await runQuality(deps(), { item: item('2025-01-10'), aoi: strip(299400, 300400) })
    expect(stats.label).toBe('NOT_COVERED')
    expect(stats.nodataFraction).toBeCloseTo(0.6, 1)
  })
  it('counts the part of the AOI beyond the scene edge as no data: 20 % outside is PARTIAL', async () => {
    const { stats } = await runQuality(deps(), { item: item('2025-01-10'), aoi: strip(299800, 300800) })
    expect(stats.label).toBe('PARTIAL')
    expect(stats.nodataFraction).toBeGreaterThan(0.15)
    expect(stats.nodataFraction).toBeLessThan(0.25)
  })
})

describe('runFrame', () => {
  it('reads the 10 m window, hashes raw bytes and reprojects onto the grid', async () => {
    const f = await runFrame(deps(), { item: item('2025-12-20'), level: 0, aoi: SITE, grid: GRID })
    expect(f.window).toEqual([92, 94, 203, 211])
    expect([f.native.width, f.native.height]).toEqual([111, 117])
    expect(f.sha256).toBe(await sha256Hex(f.native.rgb))
    expect(f.display.rgba.length).toBe(GRID.width * GRID.height * 4)
  })
  it('reads level 1 at half resolution', async () => {
    const f = await runFrame(deps(), { item: item('2025-12-20'), level: 1, aoi: SITE, grid: GRID })
    expect(f.window).toEqual([45, 46, 103, 107])
  })
  it('uses the byte cache on repeat reads', async () => {
    const store = new Map<string, Uint8Array>()
    const reads = vi.fn()
    const d: CoreDeps = {
      openCog: async (href) => {
        const cog = await openCogBuffer(toArrayBuffer(files.get(href)!))
        return {
          sizes: cog.sizes,
          read: (...a: Parameters<Cog['read']>) => {
            reads()
            return cog.read(...a)
          },
        }
      },
      cache: {
        get: async (k) => store.get(k),
        put: async (k, v) => {
          store.set(k, v)
        },
      },
    }
    const a = await runFrame(d, { item: item('2025-01-10'), level: 0, aoi: SITE, grid: GRID })
    const b = await runFrame(d, { item: item('2025-01-10'), level: 0, aoi: SITE, grid: GRID })
    expect(b.sha256).toBe(a.sha256)
    expect(reads).toHaveBeenCalledTimes(1)
  })
  it('keys the byte cache without the query string, so a SAS token never reaches it or splits it', async () => {
    const store = new Map<string, Uint8Array>()
    const reads = vi.fn()
    const d: CoreDeps = {
      openCog: async (href) => {
        const cog = await openCogBuffer(toArrayBuffer(files.get(href.split('?')[0]!)!))
        return {
          sizes: cog.sizes,
          read: (...a: Parameters<Cog['read']>) => {
            reads()
            return cog.read(...a)
          },
        }
      },
      cache: {
        get: async (k) => store.get(k),
        put: async (k, v) => {
          store.set(k, v)
        },
      },
    }
    const base = item('2025-01-10')
    const signed = (token: string) => ({
      ...base,
      visual: { ...base.visual, href: `${base.visual.href}?sig=${token}` },
    })
    const a = await runFrame(d, { item: signed('one'), level: 0, aoi: SITE, grid: GRID })
    const b = await runFrame(d, { item: signed('two'), level: 0, aoi: SITE, grid: GRID })
    expect(b.sha256).toBe(a.sha256)
    expect(reads).toHaveBeenCalledTimes(1)
    expect([...store.keys()].join()).not.toMatch(/[?]|sig=/)
  })
  it('rejects with AbortError when aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(
      runFrame(deps(), { item: item('2025-01-10'), level: 0, aoi: SITE, grid: GRID }, ac.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('drops an opener that stalls and aborts its request, so a retry opens afresh', async () => {
    const signals: Array<AbortSignal | undefined> = []
    const d: CoreDeps = {
      openCog: (href, signal) => {
        signals.push(signal)
        return signals.length === 1
          ? new Promise<Cog>(() => {})
          : openCogBuffer(toArrayBuffer(files.get(href)!))
      },
    }
    const frame = () => runFrame(d, { item: item('2025-12-20'), level: 0, aoi: SITE, grid: GRID })
    vi.useFakeTimers()
    try {
      const stalled = expect(frame()).rejects.toMatchObject({
        name: 'TimeoutError',
        message: 'COG_OPEN_TIMEOUT',
      })
      await vi.advanceTimersByTimeAsync(30_000)
      await stalled
    } finally {
      vi.useRealTimers()
    }
    expect(signals[0]?.aborted).toBe(true)
    expect((await frame()).window).toEqual([92, 94, 203, 211])
    expect(signals).toHaveLength(2)
    expect(signals[1]?.aborted).toBe(false)
  })
})

// geotiff keeps the promise of a failed tile-table lookup for the life of the opened file (node_modules/geotiff/src/imagefiledirectory.js),
// so after one failed request every later read of that opened file fails at once, with no request. The openers below model that:
// the first opened copy of a broken file fails every read, any later copy is healthy.
describe('a read that fails', () => {
  const frame = (d: CoreDeps, date: string, signal?: AbortSignal) =>
    runFrame(d, { item: item(date), level: 0, aoi: SITE, grid: GRID }, signal)
  const quality = (d: CoreDeps, date: string) => runQuality(d, { item: item(date), aoi: SITE })
  const openers = (broken: string[]) => {
    const calls: string[] = []
    const d: CoreDeps = {
      openCog: async (href) => {
        calls.push(href)
        const cog = await openCogBuffer(toArrayBuffer(files.get(href)!))
        const first = calls.filter((h) => h === href).length === 1
        return broken.includes(href) && first
          ? { sizes: cog.sizes, read: () => Promise.reject(new Error('Request failed')) }
          : cog
      },
    }
    return { d, calls }
  }

  it.each([
    ['runFrame', (d: CoreDeps) => frame(d, '2025-12-20')],
    ['runQuality', (d: CoreDeps) => quality(d, '2025-12-20')],
  ])('%s opens the file again after one read of it failed, so Try again recovers', async (_name, run) => {
    const { d, calls } = openers([item('2025-12-20').visual.href, item('2025-12-20').scl.href])
    await expect(run(d)).rejects.toThrow('Request failed')
    expect((await run(d)).sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(calls).toHaveLength(2)
  })
  it('keeps the file when the read was aborted: the caller left, the file did not fail', async () => {
    const ac = new AbortController()
    const calls: string[] = []
    let aborted = false
    const d: CoreDeps = {
      openCog: async (href) => {
        calls.push(href)
        const cog = await openCogBuffer(toArrayBuffer(files.get(href)!))
        return {
          sizes: cog.sizes,
          read: (...a: Parameters<Cog['read']>) => {
            if (aborted) return cog.read(...a)
            aborted = true
            ac.abort()
            return Promise.reject(ac.signal.reason)
          },
        }
      },
    }
    await expect(frame(d, '2025-12-20', ac.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect((await frame(d, '2025-12-20')).window).toEqual([92, 94, 203, 211])
    expect(calls).toHaveLength(1)
  })
  it('drops only the file whose read failed', async () => {
    const a = item('2025-12-20').visual.href
    const b = item('2025-01-10').visual.href
    const { d, calls } = openers([a])
    await frame(d, '2025-01-10')
    await expect(frame(d, '2025-12-20')).rejects.toThrow('Request failed')
    await frame(d, '2025-01-10')
    expect(calls.filter((h) => h === b)).toHaveLength(1)
    await frame(d, '2025-12-20')
    expect(calls.filter((h) => h === a)).toHaveLength(2)
  })
  it('keeps a newer open of the file when an older read of it fails late', async () => {
    const calls: string[] = []
    const hung: Array<(e: Error) => void> = []
    let failed = false
    const d: CoreDeps = {
      openCog: async (href) => {
        calls.push(href)
        const cog = await openCogBuffer(toArrayBuffer(files.get(href)!))
        if (calls.length > 1) return cog
        // The first copy: each read waits for the test to fail it, and once one has failed the copy stays failed.
        const read = () =>
          failed
            ? Promise.reject(new Error('Request failed'))
            : new Promise<Uint8Array>((_, reject) =>
                hung.push((e) => {
                  failed = true
                  reject(e)
                }),
              )
        return { sizes: cog.sizes, read }
      },
    }
    const one = frame(d, '2025-12-20')
    const two = frame(d, '2025-12-20') // the same opened file, a second read in flight
    await vi.waitFor(() => expect(hung).toHaveLength(2))
    hung[0]!(new Error('Request failed'))
    await expect(one).rejects.toThrow('Request failed')
    await frame(d, '2025-12-20') // opens the second copy, which now sits in the cache
    hung[1]!(new Error('Request failed'))
    await expect(two).rejects.toThrow('Request failed') // the old copy's late failure
    await frame(d, '2025-12-20')
    expect(calls).toHaveLength(2) // the second copy was not thrown out by it
  })
})

describe('runChange', () => {
  // Two display pictures on GRID: flat grey, and the same with a block of 40 x 40 display pixels much lighter.
  const n = GRID.width * GRID.height
  const grey = () => new Uint8ClampedArray(n * 4).fill(100)
  const withBlock = () => {
    const rgba = grey()
    for (let y = 100; y < 140; y++)
      for (let x = 100; x < 140; x++) rgba.fill(220, (y * GRID.width + x) * 4, (y * GRID.width + x) * 4 + 3)
    return rgba
  }
  it('runs the change rule on the two pictures', () => {
    const req = { first: { rgba: grey() }, last: { rgba: withBlock() }, grid: GRID }
    const result = runChange(req)
    expect(result).toEqual(measureChange(req))
    expect(result).toMatchObject({ state: 'changed', patches: 1 })
  })
  it('throws SIZE_MISMATCH for pictures that do not fit the grid', () => {
    const req = { first: { rgba: grey() }, last: { rgba: new Uint8ClampedArray(8) }, grid: GRID }
    expect(() => runChange(req)).toThrow('SIZE_MISMATCH')
  })
})
