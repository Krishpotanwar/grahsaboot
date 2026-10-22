import { describe, expect, it, vi } from 'vitest'
import { getItemById } from '../stac/search.ts'
import type { S2Item } from '../stac/types.ts'
import { rebuildFrames } from './rebuild.ts'
import { decodeShare, encodeShare, type ShareFrame, type ShareNotice } from './share.ts'

const TODAY = new Date('2026-10-22T09:00:00Z')

const scene = (id: string, date: string, collection: S2Item['collection'] = 'sentinel-2-l2a'): S2Item => ({
  id,
  collection,
  datetime: `${date}T05:30:00Z`,
  date,
  epsg: 32644,
  cloudCover: 5,
  baseline: '05.11',
  nodataPct: 0,
  footprint: [],
  visual: {
    href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/v',
    transform: [10, 0, 0, 0, -10, 0],
    shape: [1, 1],
  },
  scl: {
    href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/s',
    transform: [20, 0, 0, 0, -20, 0],
    shape: [1, 1],
  },
})
const A = scene('S2B_44QKJ_20190220_0_L2A', '2019-02-20')
const B = scene('S2A_44QKJ_20210215_1_L2A', '2021-02-15')
const C = scene('S2C_44QKJ_20250220_0_L2A', '2025-02-20')
const B2 = scene('S2A_44QKJ_20210215_2_L2A', '2021-02-15') // the same day, reprocessed under another id
const PC = scene('S2B_MSIL2A_20250307T053649_R005_T43QBB_20250307T082113', '2025-03-07', 'pc:sentinel-2-l2a')

const frames = (...items: S2Item[]): ShareFrame[] => items.map((i) => ({ date: i.date, id: i.id }))
const exact = (item: S2Item) => ({ date: item.date, item, exact: true })
const byDay = (item: S2Item) => ({ date: item.date, item, exact: false })
/** What a rebuild gives: the frames, the codes, and how many frames were lost to a lookup that threw. */
const result = (kept: unknown[], notices: ShareNotice[] = [], failed = 0) => ({
  frames: kept,
  notices,
  failed,
})
/** A catalogue of scenes: asked by id, or by day (the first scene of the day). */
const catalogue = (items: S2Item[]) => ({
  byId: vi.fn(async (id: string) => items.find((i) => i.id === id) ?? null),
  byDate: vi.fn(async (date: string) => items.find((i) => i.date === date) ?? null),
})
const down = async (): Promise<never> => {
  throw new Error('STAC_503')
}

describe('rebuildFrames', () => {
  it('asks for each scene by its id and gives the frames in the order of the link, with nothing to say', async () => {
    const cat = catalogue([A, B, C])
    expect(await rebuildFrames(frames(A, B, C), cat)).toEqual(result([exact(A), exact(B), exact(C)]))
    expect(cat.byId.mock.calls).toEqual([[A.id], [B.id], [C.id]])
    expect(cat.byDate).not.toHaveBeenCalled()
  })

  it('keeps the order of the link whatever order the answers come in', async () => {
    const wait: Record<string, number> = { [A.id]: 20, [B.id]: 10, [C.id]: 0 }
    const byId = async (id: string) => {
      await new Promise((r) => setTimeout(r, wait[id]))
      return [A, B, C].find((i) => i.id === id) ?? null
    }
    const out = await rebuildFrames(frames(A, B, C), { byId, byDate: async () => null })
    expect(out.frames.map((f) => f.item.id)).toEqual([A.id, B.id, C.id])
  })

  it('asks for every frame at once', async () => {
    let live = 0
    let peak = 0
    const byId = async (id: string) => {
      peak = Math.max(peak, ++live)
      await new Promise((r) => setTimeout(r, 5))
      live--
      return [A, B, C].find((i) => i.id === id) ?? null
    }
    await rebuildFrames(frames(A, B, C), { byId, byDate: async () => null })
    expect(peak).toBe(3)
  })

  it('is empty, and says nothing, for no frame', async () => {
    const cat = catalogue([A])
    expect(await rebuildFrames([], cat)).toEqual(result([]))
    expect(cat.byId).not.toHaveBeenCalled()
    expect(cat.byDate).not.toHaveBeenCalled()
  })

  describe('a miss', () => {
    it('falls back to the day when the scene is gone (null), and says so; the other frames stay exact', async () => {
      const cat = catalogue([A, B2, C]) // B's id is not in the catalogue any more, its day is
      expect(await rebuildFrames(frames(A, B, C), cat)).toEqual(
        result([exact(A), byDay(B2), exact(C)], ['date-fallback']),
      )
      expect(cat.byDate.mock.calls).toEqual([[B.date]]) // only the frame that missed is asked by its day
    })

    it('treats a lookup that fails as a miss (the catalogue did not answer): the day is asked', async () => {
      const cat = catalogue([A, B2, C])
      const byId = vi.fn(async (id: string) => (id === B.id ? down() : cat.byId(id)))
      expect(await rebuildFrames(frames(A, B, C), { byId, byDate: cat.byDate })).toEqual(
        result([exact(A), byDay(B2), exact(C)], ['date-fallback']),
      )
    })

    it('is exact, with nothing to say, when the lookup by id failed and the day search gives the very scene named', async () => {
      const cat = catalogue([A, B, C])
      const byId = vi.fn(async (id: string) => (id === B.id ? down() : cat.byId(id))) // three 503s, say, while /search works
      expect(await rebuildFrames(frames(A, B, C), { byId, byDate: cat.byDate })).toEqual(
        result([exact(A), exact(B), exact(C)]),
      )
      expect(cat.byDate.mock.calls).toEqual([[B.date]])
    })

    it('leaves a frame out, and says so, when its day has no scene either; the other frames stay', async () => {
      const cat = catalogue([A, C])
      expect(await rebuildFrames(frames(A, B, C), cat)).toEqual(
        result([exact(A), exact(C)], ['missing-frame']),
      )
      expect(cat.byDate.mock.calls).toEqual([[B.date]])
    })

    it('treats a day search that fails as a missing frame, never as an error', async () => {
      const cat = catalogue([A, C])
      const byDate = vi.fn(down)
      expect(await rebuildFrames(frames(A, B, C), { byId: cat.byId, byDate })).toEqual(
        result([exact(A), exact(C)], ['missing-frame'], 1),
      )
    })

    it('says both when one frame fell back to its day and another is missing, in the order of decodeShare', async () => {
      const cat = catalogue([B2, C]) // A is gone with its day, B only by its day
      expect(await rebuildFrames(frames(A, B, C), cat)).toEqual(
        result([byDay(B2), exact(C)], ['missing-frame', 'date-fallback']),
      )
    })

    it('says missing, and no fallback, for a frame that named no scene and is gone', async () => {
      const cat = catalogue([])
      expect(await rebuildFrames([{ date: A.date, id: null }], cat)).toEqual(result([], ['missing-frame']))
    })

    it('gives nothing, and says missing-frame, when every frame is lost: the page offers a retry', async () => {
      expect(await rebuildFrames(frames(A, B), { byId: down, byDate: down })).toEqual(
        result([], ['missing-frame'], 2),
      )
    })
  })

  describe('a lookup that threw, against a clean answer of none', () => {
    it('counts the frames lost to a failing day search, apart from the frames the catalogue has none of', async () => {
      const byId = vi.fn(async (id: string) => (id === A.id ? A : null))
      const byDate = vi.fn(async (date: string) => (date === B.date ? down() : null))
      expect(await rebuildFrames(frames(A, B, C), { byId, byDate })).toEqual(
        result([exact(A)], ['missing-frame'], 1), // B: the day search threw; C: the day has no scene
      )
    })

    it('counts every frame when nothing answers at all (offline), by id or by day', async () => {
      expect(await rebuildFrames(frames(A, B, C), { byId: down, byDate: down })).toEqual(
        result([], ['missing-frame'], 3),
      )
    })

    it('counts a frame that named no scene when its day search fails', async () => {
      const out = await rebuildFrames([{ date: A.date, id: null }], { byId: down, byDate: down })
      expect(out).toEqual(result([], ['missing-frame'], 1))
    })

    it('does not count a lookup by id that threw when the day search answers: its clean "none" stands', async () => {
      const out = await rebuildFrames(frames(A, B), { byId: down, byDate: async () => null })
      expect(out).toEqual(result([], ['missing-frame'], 0))
    })

    it('does not count a frame that was found, whatever failed on the way', async () => {
      const cat = catalogue([A, B2])
      const out = await rebuildFrames(frames(A, B), { byId: down, byDate: cat.byDate })
      expect(out).toEqual(result([exact(A), byDay(B2)], ['date-fallback'], 0)) // A: the very scene; B: its reprocessed sibling
    })
  })

  describe('an answer it does not trust', () => {
    it.each([
      ['another scene than the one named', { ...B, id: B2.id }],
      [
        'a scene of another day than the frame has',
        { ...B, date: '2021-02-16', datetime: '2021-02-16T05:30:00Z' },
      ],
    ])('takes %s for a miss and asks the day instead', async (_why, wrong) => {
      const byId = vi.fn(async (id: string) => (id === B.id ? wrong : id === A.id ? A : null))
      const byDate = vi.fn(async (date: string) => (date === B.date ? B2 : null))
      expect(await rebuildFrames(frames(A, B), { byId, byDate })).toEqual(
        result([exact(A), byDay(B2)], ['date-fallback']),
      )
    })
  })

  describe('an old link that names days only, and the other catalogue', () => {
    it('opens an old date-only link by the days: no id to ask for, and it says so', async () => {
      const old = decodeShare('v=1&lat=21.1458&lon=79.0882&side=2000&d=2019-02-20,2021-02-15', TODAY).share!
        .frames
      const cat = catalogue([A, B])
      expect(await rebuildFrames(old, cat)).toEqual(result([byDay(A), byDay(B)], ['date-fallback']))
      expect(cat.byId).not.toHaveBeenCalled()
      expect(cat.byDate.mock.calls).toEqual([[A.date], [B.date]])
    })

    it('opens a link made on the Planetary Computer fallback by its days: the other catalogue left no id in it', async () => {
      const share = { lat: 21.1458, lon: 79.0882, sideM: 2000, frames: [{ date: PC.date, id: PC.id }] }
      const link = decodeShare(encodeShare(share, TODAY)!, TODAY).share!.frames
      expect(link).toEqual([{ date: PC.date, id: null }])
      const cat = catalogue([PC])
      expect(await rebuildFrames(link, cat)).toEqual(result([byDay(PC)], ['date-fallback']))
      expect(cat.byId).not.toHaveBeenCalled()
    })

    it('takes the scene the other catalogue gives for the day when only that catalogue answers', async () => {
      const cat = catalogue([PC])
      const out = await rebuildFrames([{ date: PC.date, id: 'S2B_44QKJ_20250307_0_L2A' }], {
        byId: down, // Earth Search is not answering
        byDate: cat.byDate, // the day search falls back to Planetary Computer
      })
      expect(out).toEqual(result([byDay(PC)], ['date-fallback']))
      expect(out.frames[0]!.item.collection).toBe('pc:sentinel-2-l2a')
    })
  })

  describe('an abort', () => {
    it('lets a caller abort through: nothing is asked by day after it', async () => {
      const ac = new AbortController()
      const byId = vi.fn(
        (_id: string) =>
          new Promise<never>((_, reject) =>
            ac.signal.addEventListener('abort', () => reject(ac.signal.reason), { once: true }),
          ),
      )
      const byDate = vi.fn(async () => null)
      const p = rebuildFrames(frames(A, B, C), { byId, byDate, signal: ac.signal })
      ac.abort()
      await expect(p).rejects.toMatchObject({ name: 'AbortError' })
      expect(byDate).not.toHaveBeenCalled()
    })

    it('stops after an abort even when the lookup ignores its signal and answers', async () => {
      const ac = new AbortController()
      const byId = vi.fn(async () => (ac.abort(), null))
      const byDate = vi.fn(async () => B2)
      await expect(rebuildFrames(frames(A, B, C), { byId, byDate, signal: ac.signal })).rejects.toMatchObject(
        {
          name: 'AbortError',
        },
      )
      expect(byDate).not.toHaveBeenCalled()
    })

    it('lets a caller abort through in the day search too: it is neither a missing frame nor a failed one', async () => {
      const ac = new AbortController()
      const byDate = vi.fn(
        (_date: string) =>
          new Promise<never>((_, reject) =>
            ac.signal.addEventListener('abort', () => reject(ac.signal.reason), { once: true }),
          ),
      )
      const p = rebuildFrames(frames(A, B), { byId: async () => null, byDate, signal: ac.signal })
      await new Promise((r) => setTimeout(r, 0)) // the lookups by id have answered and the day searches are waiting
      expect(byDate).toHaveBeenCalledTimes(2)
      ac.abort()
      await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    })

    it('ends with the abort even when the scene is already in hand: an aborted rebuild rejects and never fulfils', async () => {
      const ac = new AbortController()
      const byId = vi.fn(async () => (ac.abort(), A)) // one frame, so nothing else is asked after the abort to notice it
      await expect(
        rebuildFrames(frames(A), { byId, byDate: async () => null, signal: ac.signal }),
      ).rejects.toMatchObject({
        name: 'AbortError',
      })
    })

    it('asks nothing at all when the caller has already gone', async () => {
      const ac = new AbortController()
      ac.abort()
      const cat = catalogue([A, B, C])
      await expect(rebuildFrames(frames(A, B, C), { ...cat, signal: ac.signal })).rejects.toMatchObject({
        name: 'AbortError',
      })
      expect(cat.byId).not.toHaveBeenCalled()
      expect(cat.byDate).not.toHaveBeenCalled()
    })

    // WebKit ends a request that AbortSignal.timeout cut short with an AbortError, the name a caller's abort gets too: only the
    // caller's own signal tells them apart.
    it('does not take a timed-out lookup, which rejects with an AbortError (WebKit), for a caller abort', async () => {
      const caller = new AbortController() // never aborted
      const byId = vi.fn(async () => {
        throw new DOMException('Aborted', 'AbortError')
      })
      const cat = catalogue([A, B])
      expect(await rebuildFrames(frames(A, B), { byId, byDate: cat.byDate, signal: caller.signal })).toEqual(
        result([exact(A), exact(B)]), // by id it failed, by day it is the very scene named
      )
    })
  })

  it('does not change what it is given', async () => {
    const given = Object.freeze(frames(A, B, C).map((f) => Object.freeze(f)))
    const out = await rebuildFrames(given, catalogue([A, B, C]))
    expect(given).toEqual(frames(A, B, C))
    expect(out.frames).not.toBe(given)
  })
})

// The three pieces together: a link is read, each scene is fetched by its id with the real getItemById, a scene that is gone
// falls back to its day.
describe('a share link rebuilt through decodeShare and the real getItemById', () => {
  const feature = (s: S2Item) => ({
    id: s.id,
    collection: 'sentinel-2-l2a',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [78, 20],
          [80, 20],
          [80, 22],
          [78, 22],
          [78, 20],
        ],
      ],
    },
    properties: { 'proj:epsg': 32644, datetime: s.datetime },
    assets: {
      visual: {
        href: s.visual.href,
        'proj:shape': [10980, 10980],
        'proj:transform': [10, 0, 199980, 0, -10, 2400000],
      },
      scl: {
        href: s.scl.href,
        'proj:shape': [5490, 5490],
        'proj:transform': [20, 0, 199980, 0, -20, 2400000],
      },
    },
  })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  /** The scene id a request is for: the last part of `.../items/<id>`. */
  const idOf = (input: RequestInfo | URL) => String(input).split('/').pop()!
  const link = encodeShare({ lat: 21.1458, lon: 79.0882, sideM: 2000, frames: frames(A, B, C) }, TODAY)!
  const dayOf = (date: string) => [A, B, C].find((s) => s.date === date) ?? null

  it('opens the same scenes when the catalogue has them all', async () => {
    const served = new Map([A, B, C].map((s) => [s.id, feature(s)]))
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => json(served.get(idOf(input))))
    const byDate = vi.fn(async () => null)
    const read = decodeShare(link, TODAY)
    const out = await rebuildFrames(read.share!.frames, {
      byId: (id) => getItemById(id, { fetchImpl, sleep: async () => {} }),
      byDate,
    })
    expect(out.notices).toEqual([])
    expect(out.failed).toBe(0)
    expect(out.frames.map((f) => [f.item.id, f.item.date, f.exact])).toEqual(
      [A, B, C].map((s) => [s.id, s.date, true]),
    )
    expect(byDate).not.toHaveBeenCalled()
  })

  it('falls back to the day, with a notice, for a scene the catalogue answers 404 for (a miss)', async () => {
    const served = new Map([A, C].map((s) => [s.id, feature(s)])) // B is gone
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const f = served.get(idOf(input))
      return f ? json(f) : json({ code: 'NotFound', description: 'Not Found' }, 404)
    })
    const byDate = vi.fn(async (date: string) => (date === B.date ? B2 : null))
    const read = decodeShare(link, TODAY)
    const out = await rebuildFrames(read.share!.frames, {
      byId: (id) => getItemById(id, { fetchImpl, sleep: async () => {} }),
      byDate,
    })
    expect(out.notices).toEqual(['date-fallback'])
    expect(out.frames.map((f) => [f.item.id, f.exact])).toEqual([
      [A.id, true],
      [B2.id, false],
      [C.id, true],
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(3) // a 404 is not retried
    expect(byDate.mock.calls).toEqual([[B.date]])
  })

  it('is no fallback when the lookups by id fail for a while and the day search then gives the very scenes', async () => {
    const fetchImpl = vi.fn(async () => json({}, 503)) // every lookup by id: three 503s, while /search works
    const byDate = vi.fn(async (date: string) => dayOf(date))
    const read = decodeShare(link, TODAY)
    const out = await rebuildFrames(read.share!.frames, {
      byId: (id) => getItemById(id, { fetchImpl, sleep: async () => {} }),
      byDate,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(9) // three attempts for each of the three scenes
    expect(out.notices).toEqual([])
    expect(out.frames.map((f) => [f.item.id, f.exact])).toEqual([A, B, C].map((s) => [s.id, true]))
  })

  it('falls back to the days, with a notice, when Earth Search does not answer and the other catalogue does', async () => {
    const fetchImpl = vi.fn(async () => json({}, 503))
    const pc = (s: S2Item) => scene(`S2X_MSIL2A_${s.date.replaceAll('-', '')}`, s.date, 'pc:sentinel-2-l2a')
    const byDate = vi.fn(async (date: string) => pc(dayOf(date)!))
    const read = decodeShare(link, TODAY)
    const out = await rebuildFrames(read.share!.frames, {
      byId: (id) => getItemById(id, { fetchImpl, sleep: async () => {} }),
      byDate,
    })
    expect(out.notices).toEqual(['date-fallback'])
    expect(out.frames.map((f) => [f.item.collection, f.exact])).toEqual(
      [A, B, C].map(() => ['pc:sentinel-2-l2a', false]),
    )
  })

  it('counts every frame as failed, not as missing for want of a scene, when nothing answers at all', async () => {
    const fetchImpl = vi.fn(async () => json({}, 503))
    const read = decodeShare(link, TODAY)
    const out = await rebuildFrames(read.share!.frames, {
      byId: (id) => getItemById(id, { fetchImpl, sleep: async () => {} }),
      byDate: down,
    })
    expect(out).toEqual(result([], ['missing-frame'], 3))
  })

  it('still ends at once on a caller abort in the middle of a lookup: no day is asked', async () => {
    const ac = new AbortController()
    const fetchImpl = vi.fn(async () => (ac.abort(), json({}, 503)))
    const byDate = vi.fn(async () => null)
    const read = decodeShare(link, TODAY)
    await expect(
      rebuildFrames(read.share!.frames, {
        byId: (id) => getItemById(id, { fetchImpl, sleep: async () => {}, signal: ac.signal }),
        byDate,
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(byDate).not.toHaveBeenCalled()
  })

  it('merges with the codes of decodeShare as a set: a damaged link whose one frame is gone says missing once, never a fallback', async () => {
    const read = decodeShare('v=1&lat=21.1458&lon=79.0882&side=2000&d=2019-02-20,zzzz', TODAY)
    expect(read.notices).toEqual(['missing-frame']) // the damaged day
    const out = await rebuildFrames(read.share!.frames, catalogue([])) // the one frame left names no scene and its day has none
    expect(out.notices).toEqual(['missing-frame'])
    expect([...new Set([...read.notices, ...out.notices])]).toEqual(['missing-frame'])
  })
})
