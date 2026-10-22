import { describe, expect, it } from 'vitest'
import {
  CHANGE_CONSTANTS as C,
  CHANGE_RECIPE,
  measureChange,
  type ChangeFrame,
  type ChangeInput,
  type ChangeResult,
} from './change.ts'
import { makeDisplayGrid } from './display.ts'
import { haversineM } from './geodesy.ts'
import type { DisplayGrid } from './types.ts'
import { fromMercator, toMercator } from './utm.ts'

// Every number below that decides a state comes from the exported constants, never from a literal 30 or 38: the constants are
// provisional until they are tuned on real places, and these tests must follow them (ruling R26).

/** Ground metres per Mercator metre on the equator, from the two Earth radii the code measures with. */
const GROUND_PER_MERC = haversineM([0, 0], [1, 0]) / toMercator([1, 0])[0]

/** A size x size grid at `lat` whose display pixels are exactly C.nativeM / k metres on the ground: k display pixels span one native pixel. */
function gridOf(size: number, k: number, lat = 21): DisplayGrid {
  const [cx, cy] = toMercator([79, lat])
  const px = C.nativeM / k / (Math.cos((lat * Math.PI) / 180) * GROUND_PER_MERC)
  const half = (size * px) / 2
  const [minX, maxX, minY, maxY] = [cx - half, cx + half, cy - half, cy + half]
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: size,
    height: size,
    cornersLonLat: [
      fromMercator([minX, maxY]),
      fromMercator([maxX, maxY]),
      fromMercator([maxX, minY]),
      fromMercator([minX, minY]),
    ],
  }
}

const K = 2 // the grid of the F10 example: about 2 display pixels per 10 m pixel
const SIZE = 140
const G = gridOf(SIZE, K)
const BLOCK = C.blockNative * K // display pixels across a block 30 m wide on G
const AREA_MIN = C.areaMinNative * K * K // display pixels in 0.3 ha on G
const AT = 32 // where the new site sits: a square of 40 display pixels (1600 of them, 4 ha on G) that most fixtures change

type Rgb = readonly [number, number, number]
type Where = (x: number, y: number) => boolean
type Diff = (x: number, y: number) => Rgb
type Pair = { first: ChangeFrame; last: ChangeFrame }

const NONE: Rgb = [0, 0, 0]
const same = (d: number): Rgb => [d, d, d]
/** `v` in band `b` and nothing in the others. */
const inBand = (b: number, v: number): Rgb => [b === 0 ? v : 0, b === 1 ? v : 0, b === 2 ? v : 0]
/** A clearly changed band, one just over the band threshold, and an ordinary seasonal shift (all well inside 0..255 on BASE). */
const FAR = 2 * C.bandThreshold
const OVER = C.bandThreshold + 1
const SOFT = Math.floor(C.shiftLimit / 2)

const BASE = 100
const texture = (x: number, y: number) => (x * 7 + y * 13) % 23

const rect =
  (x0: number, y0: number, w: number, h: number): Where =>
  (x, y) =>
    x >= x0 && x < x0 + w && y >= y0 && y < y0 + h
const SITE = rect(AT, AT, 40, 40)
const either =
  (...parts: Where[]): Where =>
  (x, y) =>
    parts.some((p) => p(x, y))
/** `d` where `where` holds, nothing elsewhere. */
const only =
  (where: Where, d: Rgb): Diff =>
  (x, y) =>
    where(x, y) ? d : NONE

/** The two pictures of one place: the first has some texture, the last is the first plus `diff(x, y)` in each band. */
function pair(g: DisplayGrid, diff: Diff = () => NONE): Pair {
  const a = new Uint8ClampedArray(g.width * g.height * 4)
  const b = new Uint8ClampedArray(a.length)
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      const o = (y * g.width + x) * 4
      const d = diff(x, y)
      for (let c = 0; c < 3; c++) {
        a[o + c] = BASE + texture(x, y)
        b[o + c] = BASE + texture(x, y) + d[c]!
      }
      a[o + 3] = 255
      b[o + 3] = 255
    }
  return { first: { rgba: a }, last: { rgba: b } }
}

const mask = (g: DisplayGrid, where: Where): Uint8Array =>
  Uint8Array.from({ length: g.width * g.height }, (_, i) =>
    where(i % g.width, Math.floor(i / g.width)) ? 1 : 0,
  )
/** The frame with `invalid` set where `where` holds (a cloud map), and its picture left as it was. */
const clouded = (f: ChangeFrame, g: DisplayGrid, where: Where): ChangeFrame => ({
  ...f,
  invalid: mask(g, where),
})
/** The frame with alpha 0 where `where` holds (no data). */
const blank = (f: ChangeFrame, g: DisplayGrid, where: Where): ChangeFrame => {
  const rgba = f.rgba.slice()
  for (let i = 0; i < g.width * g.height; i++)
    if (where(i % g.width, Math.floor(i / g.width))) rgba[i * 4 + 3] = 0
  return { ...f, rgba }
}

const run = (p: Pair, g: DisplayGrid = G, extra: Partial<ChangeInput> = {}): ChangeResult =>
  measureChange({ first: p.first, last: p.last, grid: g, ...extra })

function changed(r: ChangeResult) {
  expect(r.state).toBe('changed')
  if (r.state !== 'changed') throw new Error(`expected changed, got ${r.state}`)
  return r
}
function withShift(r: ChangeResult) {
  if (r.state === 'not-enough-ground') throw new Error('no shift is estimated for not-enough-ground')
  return r
}
/** Hectares of `pixels` display pixels on a grid of k display pixels per native pixel. */
const ha = (pixels: number, k = K) => (pixels * (C.nativeM / k) ** 2) / 10_000

const allOf = (g: DisplayGrid): Where => rect(0, 0, g.width, g.height)
const rowsOf = (share: number): Where => rect(0, 0, SIZE, Math.ceil(SIZE * share))

describe('change-v1', () => {
  describe('the rule and its constants', () => {
    it('is tagged change-v1 and keeps its numbers in one frozen object', () => {
      expect(CHANGE_RECIPE).toBe('change-v1')
      expect(Object.isFrozen(C)).toBe(true)
      for (const v of Object.values(C)) expect(Number.isFinite(v) && v > 0).toBe(true)
    })

    it('records the rule and its constants beside every state it can return', () => {
      const p = pair(G)
      const results = [
        run({ first: p.first, last: clouded(p.last, G, allOf(G)) }),
        run(pair(G, only(rowsOf(0.6), same(FAR)))),
        run(p),
        run(pair(G, only(SITE, same(FAR)))),
      ]
      expect(results.map((r) => r.state)).toEqual(['not-enough-ground', 'most-differs', 'nothing', 'changed'])
      for (const r of results) {
        expect(r.recipe).toBe(CHANGE_RECIPE)
        expect(r.constants).toEqual(C)
      }
    })
  })

  describe('checks at the edge', () => {
    it('throws SIZE_MISMATCH for pictures of different sizes', () => {
      expect(() => measureChange({ first: pair(G).first, last: pair(gridOf(20, K)).last, grid: G })).toThrow(
        'SIZE_MISMATCH',
      )
    })
    it('throws SIZE_MISMATCH when the pictures are not the size of the grid', () => {
      expect(() => run(pair(G), gridOf(SIZE - 1, K))).toThrow('SIZE_MISMATCH')
    })
    it('throws SIZE_MISMATCH for a mask that is not one byte per display pixel', () => {
      const p = pair(G)
      const short = new Uint8Array(SIZE * SIZE - 1)
      expect(() => run(p, G, { first: { ...p.first, invalid: short } })).toThrow('SIZE_MISMATCH')
      expect(() => run(p, G, { last: { ...p.last, invalid: short } })).toThrow('SIZE_MISMATCH')
      expect(() => run(p, G, { inside: short })).toThrow('SIZE_MISMATCH')
    })
    it('throws BAD_GRID for a grid with no ground size, rather than call a pair with no area "nothing"', () => {
      const lost: [number, number] = [NaN, NaN]
      const bad: DisplayGrid = { ...G, cornersLonLat: [lost, lost, lost, lost] }
      expect(() => run(pair(G), bad)).toThrow('BAD_GRID')
    })
    it('leaves its inputs as they were', () => {
      const p = pair(G, only(SITE, same(FAR)))
      const first = clouded(p.first, G, rect(0, 0, 10, 10))
      const inside = mask(G, rect(20, 20, 80, 80))
      const before = [first.rgba.slice(), p.last.rgba.slice(), first.invalid!.slice(), inside.slice()]
      run({ first, last: p.last }, G, { inside })
      expect([first.rgba, p.last.rgba, first.invalid, inside]).toEqual(before)
    })
  })

  describe('only ground that is clear in both pictures counts', () => {
    const block = SITE
    const bigChange = pair(G, only(block, same(FAR)))

    it('sees a changed block when nothing is marked', () => {
      expect(run(bigChange).state).toBe('changed')
    })
    it.each(['first', 'last'] as const)(
      'leaves out a changed block that has alpha 0 in the %s picture',
      (which) => {
        const r = run({ ...bigChange, [which]: blank(bigChange[which], G, block) })
        expect(r.state).toBe('nothing')
        expect(r.clearPixels).toBe(SIZE * SIZE - 40 * 40)
      },
    )
    it.each(['first', 'last'] as const)(
      'leaves out a changed block that the cloud map of the %s picture marks',
      (which) => {
        const r = run({ ...bigChange, [which]: clouded(bigChange[which], G, block) })
        expect(r.state).toBe('nothing')
        expect(r.clearPixels).toBe(SIZE * SIZE - 40 * 40)
      },
    )

    // The two masks are combined: each picture alone is mostly clear here, but the ground clear in both is not.
    const cloudCols = (SIZE * (1 - C.clearShare)) / 2
    it('says there is not enough ground when under half of it is clear in both pictures at once', () => {
      expect(Number.isInteger(cloudCols)).toBe(true) // the fixture needs whole columns: rebuild it if the share changes
      const more = cloudCols + 3
      const p = pair(G)
      const r = run({
        first: clouded(p.first, G, rect(0, 0, more, SIZE)),
        last: clouded(p.last, G, rect(SIZE - more, 0, more, SIZE)),
      })
      expect(r.state).toBe('not-enough-ground')
    })
    it('goes on at exactly the share, which is a minimum and not a limit', () => {
      const p = pair(G)
      const r = run({
        first: clouded(p.first, G, rect(0, 0, cloudCols, SIZE)),
        last: clouded(p.last, G, rect(SIZE - cloudCols, 0, cloudCols, SIZE)),
      })
      expect(r.state).toBe('nothing')
      expect(r.clearPixels).toBe(SIZE * SIZE * C.clearShare)
    })
    it('looks at the ground before it looks for change: too little clear ground wins over a shifted pair', () => {
      const p = pair(G, () => same(C.shiftLimit))
      expect(run(p).state).toBe('most-differs')
      expect(run({ first: clouded(p.first, G, rowsOf(0.6)), last: p.last }).state).toBe('not-enough-ground')
    })
    it('says there is not enough ground for a pair with nothing clear, and counts no pixel', () => {
      const p = pair(G)
      const r = run({ first: clouded(p.first, G, allOf(G)), last: p.last })
      expect(r.state).toBe('not-enough-ground')
      expect(r.clearPixels).toBe(0)
    })
    it('counts the pixels a figure rests on', () => {
      expect(run(pair(G)).clearPixels).toBe(SIZE * SIZE)
    })
  })

  describe('the normal shift', () => {
    it('is nothing for a pair that did not change, with no shift to take off', () => {
      const r = withShift(run(pair(G)))
      expect(r.state).toBe('nothing')
      expect(r.shift).toEqual([0, 0, 0])
    })
    // Each band has its own shift, as far apart as the shift limit allows; the three orders catch any band measured against
    // another band's shift (a changed pixel needs all three bands over the threshold, so one wrong band alone hides itself).
    const A = C.shiftLimit - 1
    const orders: { s: Rgb }[] = [{ s: [A, -A, 0] }, { s: [A, 0, -A] }, { s: [0, A, -A] }]
    it.each(orders)('takes off a uniform shift of the whole picture, band by band: $s', ({ s }) => {
      const r = withShift(run(pair(G, () => s)))
      expect(r.state).toBe('nothing')
      expect(r.shift).toEqual(s)
    })
    it.each(orders)('still sees a changed block over a shift that differs by band: $s', ({ s }) => {
      const block = SITE
      const r = changed(run(pair(G, (x, y) => (block(x, y) ? [s[0] + FAR, s[1] + FAR, s[2] + FAR] : s))))
      expect(r.shift).toEqual(s)
    })
    it('is the median of the per-pixel difference, not its mean', () => {
      // 60 of the 100 pixels differ by 5, 40 by 15: the median is 5, the mean 9
      const g = gridOf(10, K)
      const r = withShift(
        run(
          pair(g, (x, y) => same(y * 10 + x < 60 ? 5 : 15)),
          g,
        ),
      )
      expect(r.shift).toEqual([5, 5, 5])
    })
    it('is not pulled by a changed block on a minority of the ground', () => {
      const block = SITE
      const r = changed(run(pair(G, (x, y) => (block(x, y) ? same(FAR) : same(SOFT)))))
      expect(r.shift).toEqual([SOFT, SOFT, SOFT])
      expect(r.patches).toBe(1)
    })
    it('is worked out again on the pixels that were not flagged', () => {
      expect(C.passes).toBeGreaterThan(1)
      // 20 x 20: the 240 pixels of the first 12 rows differ by their column (0..19, twelve of each), the last 160 by FAR.
      // Over all 400 the median is 16, pulled up by the changed ones; over the 240 that were not flagged it is 9.
      const g = gridOf(20, K)
      const r = withShift(
        run(
          pair(g, (x, y) => (y < 12 ? same(x) : same(FAR))),
          g,
        ),
      )
      expect(r.shift).toEqual([9, 9, 9])
    })
  })

  describe('a pixel is changed only when red, green and blue all differ', () => {
    const block = SITE
    it('flags a block whose three bands all differ by more than the band threshold', () => {
      expect(run(pair(G, only(block, same(OVER)))).state).toBe('changed')
    })
    it('does not flag a block that differs by exactly the band threshold', () => {
      expect(run(pair(G, only(block, same(C.bandThreshold)))).state).toBe('nothing')
    })
    it.each([0, 1, 2])(
      'does not flag a block whose band %i stays put or differs by exactly the threshold',
      (b) => {
        // the other two bands are far over it (green to brown: red and green move, blue hardly)
        const withBand = (v: number) => {
          const d = [FAR, -FAR, FAR] as [number, number, number]
          d[b] = v
          return run(pair(G, only(block, d))).state
        }
        expect(withBand(5)).toBe('nothing')
        expect(withBand(C.bandThreshold)).toBe('nothing')
        expect(withBand(-C.bandThreshold)).toBe('nothing')
        expect(withBand(OVER)).toBe('changed')
        expect(withBand(-OVER)).toBe('changed')
      },
    )
  })

  describe('"Most of the area looks different"', () => {
    it('is said when 60% of the area was replaced, and no area is stated', () => {
      const r = run(pair(G, only(rowsOf(0.6), same(FAR))))
      expect(r.state).toBe('most-differs')
      expect(r).not.toHaveProperty('hectares')
      expect(r).not.toHaveProperty('patches')
    })
    it.each([0, 1, 2])(
      'is said when the final shift reaches the limit in band %i alone, and not one below',
      (b) => {
        expect(run(pair(G, () => inBand(b, C.shiftLimit))).state).toBe('most-differs')
        expect(run(pair(G, () => inBand(b, C.shiftLimit - 1))).state).toBe('nothing')
      },
    )
    it('is said when half or more of the clear pixels are flagged, though the shift is small and few differ before it', () => {
      // 45% at mid - OVER, 10% at mid, 45% at mid + OVER: the median is mid, under the shift limit, and both outer groups
      // are flagged (90%); of the raw differences only the upper 45% reach the band threshold.
      const g = gridOf(10, K)
      const mid = C.shiftLimit - 8
      const r = run(
        pair(g, (x, y) => {
          const i = y * 10 + x
          return same(i < 45 ? mid - OVER : i < 55 ? mid : mid + OVER)
        }),
        g,
      )
      expect(r.state).toBe('most-differs')
    })
    it('is said when half or more of the clear pixels differ by the band threshold before any shift, and not at one fewer', () => {
      const g = gridOf(10, K)
      const half = 100 * C.rawShare // exactly the share
      const withCount = (n: number) =>
        run(
          pair(g, (x, y) => same(y * 10 + x >= 100 - n ? C.bandThreshold : 0)),
          g,
        )
      expect(withCount(half).state).toBe('most-differs')
      expect(withCount(half - 1).state).toBe('nothing')
    })
  })

  describe('a changed patch needs an area and a width', () => {
    it('does not count a line one native pixel wide, however long', () => {
      expect(run(pair(G, only(rect(10, 10, 1 * K, 60 * K), same(FAR)))).state).toBe('nothing')
    })
    it('counts a road three native pixels wide', () => {
      const r = changed(run(pair(G, only(rect(10, 10, 3 * K, 40 * K), same(FAR)))))
      expect(r.patches).toBe(1)
      expect(r.hectares).toBeCloseTo(ha(3 * K * 40 * K), 6)
    })
    it('counts a block six native pixels across', () => {
      const r = changed(run(pair(G, only(rect(10, 10, 6 * K, 6 * K), same(FAR)))))
      expect(r.patches).toBe(1)
      expect(r.hectares).toBeCloseTo(ha(6 * K * 6 * K), 6)
    })
    it('does not count a block wide enough but under the area minimum, and counts a strip of exactly the minimum', () => {
      const side = Math.ceil(Math.sqrt(C.areaMinNative)) - 1 // 5 native pixels: 25 < 30
      expect(side * side).toBeLessThan(C.areaMinNative)
      expect(side).toBeGreaterThanOrEqual(C.blockNative)
      expect(run(pair(G, only(rect(10, 10, side * K, side * K), same(FAR)))).state).toBe('nothing')
      const len = C.areaMinNative / C.blockNative
      expect(Number.isInteger(len)).toBe(true)
      expect(run(pair(G, only(rect(10, 10, C.blockNative * K, len * K), same(FAR)))).state).toBe('changed')
      expect(run(pair(G, only(rect(10, 10, C.blockNative * K, (len - 1) * K), same(FAR)))).state).toBe(
        'nothing',
      )
    })
    it('joins pixels that touch at a corner (8-connected): two blocks, each too small alone, count once', () => {
      const a = rect(10, 10, BLOCK, 2 * BLOCK)
      const b = rect(10 + BLOCK, 10 + 2 * BLOCK, BLOCK, 2 * BLOCK)
      expect(2 * BLOCK * BLOCK).toBeLessThan(AREA_MIN) // each alone is under the minimum
      expect(4 * BLOCK * BLOCK).toBeGreaterThanOrEqual(AREA_MIN) // together they are not
      const r = changed(run(pair(G, only(either(a, b), same(FAR)))))
      expect(r.patches).toBe(1)
      expect(r.hectares).toBeCloseTo(ha(4 * BLOCK * BLOCK), 6)
    })
    it('counts two separate patches, and the hectares of both', () => {
      const a = rect(10, 10, 12 * K, 12 * K)
      const b = rect(80, 80, 20 * K, 6 * K)
      const r = changed(run(pair(G, only(either(a, b), same(FAR)))))
      expect(r.patches).toBe(2)
      expect(r.hectares).toBeCloseTo(ha(12 * K * 12 * K + 20 * K * 6 * K), 6)
    })
    it('counts the opened patch and not the thin tail that hung on it', () => {
      const body = rect(10, 10, 12 * K, 12 * K)
      const tail = rect(10 + 12 * K, 10, 40 * K, 1 * K)
      const r = changed(run(pair(G, only(either(body, tail), same(FAR)))))
      expect(r.patches).toBe(1)
      expect(r.hectares).toBeCloseTo(ha(12 * K * 12 * K), 6)
    })
    it('keeps the whole of an L-shaped patch, corner included', () => {
      const down = rect(10, 10, BLOCK, 40)
      const across = rect(10, 10 + 40 - BLOCK, 40, BLOCK)
      const r = changed(run(pair(G, only(either(down, across), same(FAR)))))
      expect(r.patches).toBe(1)
      expect(r.hectares).toBeCloseTo(ha(BLOCK * 40 + (40 - BLOCK) * BLOCK), 6)
    })
    it('counts a block that touches the edge of the grid in full', () => {
      const edge = rect(SIZE - 12, SIZE - 12, 12, 12)
      const r = changed(run(pair(G, only(either(edge, rect(0, 0, 12, 12)), same(FAR)))))
      expect(r.patches).toBe(2)
      expect(r.hectares).toBeCloseTo(ha(2 * 12 * 12), 6)
    })
    it('does not count scattered noise', () => {
      let s = 123456789 // xorshift32: the same noise on every run
      const noise: Where = () => {
        s ^= s << 13
        s ^= s >>> 17
        s ^= s << 5
        return (s >>> 0) / 4294967296 < 0.25
      }
      expect(run(pair(G, only(noise, same(FAR)))).state).toBe('nothing')
    })
    it('does not count a green field that turned brown: two bands move a lot, the blue one hardly', () => {
      expect(run(pair(G, only(rect(20, 20, 60, 60), [FAR, -FAR, 4]))).state).toBe('nothing')
    })
    it('does not count a cloud patch the cloud map marks, and would count it if the map were missing', () => {
      const cloud = SITE
      const white = pair(G, only(cloud, same(FAR)))
      expect(run(white).state).toBe('changed')
      expect(run({ ...white, last: clouded(white.last, G, cloud) }).state).toBe('nothing')
    })
    it('counts a new square of 40 pixels, with its area in hectares', () => {
      const r = changed(run(pair(G, only(rect(50, 50, 40, 40), same(FAR)))))
      expect(r.patches).toBe(1)
      expect(r.hectares).toBeCloseTo(ha(1600), 6)
    })
  })

  describe('the minimums follow the grid', () => {
    // The same ground scene, drawn on grids of 1, 2 and 3 display pixels per native pixel, gives the same answer and area.
    it.each([1, 2, 3])('on a grid of %i display pixel(s) per native pixel', (k) => {
      const g = gridOf(60 * k, k)
      const at = (w: number, h: number) => run(pair(g, only(rect(5 * k, 5 * k, w * k, h * k), same(FAR))), g)
      const side = Math.ceil(Math.sqrt(C.areaMinNative)) - 1
      const len = C.areaMinNative / C.blockNative
      const nativeHa = (w: number, h: number) => (w * h * C.nativeM ** 2) / 10_000
      expect(at(1, 40).state).toBe('nothing') // a line one native pixel wide
      expect(changed(at(C.blockNative, 40)).hectares).toBeCloseTo(nativeHa(C.blockNative, 40), 6)
      expect(changed(at(6, 6)).hectares).toBeCloseTo(nativeHa(6, 6), 6)
      expect(at(side, side).state).toBe('nothing') // under the area minimum
      expect(changed(at(C.blockNative, len)).hectares).toBeCloseTo(nativeHa(C.blockNative, len), 6) // exactly the minimum
      expect(at(C.blockNative, len - 1).state).toBe('nothing')
    })

    // On the real 2 km grid (about 400 by 400) a display pixel is about 5.5 m, not 5 m (makeDisplayGrid pads every side by
    // 100 m): the minimums are rounded up, so a counted patch is never under 30 m across or 0.3 ha.
    const DLAT = 2 / (haversineM([0, 0], [1, 0]) / 1000)
    const DLON = DLAT / Math.cos((21.1458 * Math.PI) / 180)
    const REAL = makeDisplayGrid(
      [79.0882 - DLON / 2, 21.1458 - DLAT / 2, 79.0882 + DLON / 2, 21.1458 + DLAT / 2],
      400,
      0,
    )
    it('rounds the width and the area up on the real grid', () => {
      const at = (w: number, h: number) => run(pair(REAL, only(rect(50, 50, w, h), same(FAR))), REAL)
      expect(at(5, 60).state).toBe('nothing') // 5 pixels are about 27 m
      expect(at(6, 60).state).toBe('changed') // 6 pixels are about 33 m
      expect(at(6, 16).state).toBe('nothing') // 96 pixels are about 0.29 ha
      expect(at(6, 17).state).toBe('changed') // 102 pixels are about 0.30 ha
    })
  })

  describe('the outline (inside)', () => {
    const block = SITE
    const site = pair(G, only(block, same(FAR)))
    it('is the whole grid when it is left out, and when it holds every pixel', () => {
      expect(run(site, G, { inside: mask(G, allOf(G)) })).toEqual(run(site))
    })
    it('counts a changed block inside the outline and not one outside it', () => {
      const r = changed(run(site, G, { inside: mask(G, rect(0, 0, 100, SIZE)) }))
      expect(r.hectares).toBeCloseTo(ha(1600), 6)
      expect(run(site, G, { inside: mask(G, rect(100, 0, 40, SIZE)) }).state).toBe('nothing')
    })
    it('counts only the part of a patch that lies inside the outline', () => {
      const r = changed(run(site, G, { inside: mask(G, rect(0, 0, AT + 20, SIZE)) })) // the first 20 columns of the site
      expect(r.patches).toBe(1)
      expect(r.hectares).toBeCloseTo(ha(20 * 40), 6)
    })
    it('cuts the flags to the outline before it opens them: a sliver whose width lies outside is not a patch', () => {
      // the block is 40 wide, but only its first BLOCK - 1 columns are inside: too narrow inside, whatever lies beyond
      const r = run(site, G, { inside: mask(G, rect(0, 0, AT + BLOCK - 1, SIZE)) })
      expect(r.state).toBe('nothing')
    })
    it('takes the normal shift from the whole grid, so a site that fills its tight outline is still seen', () => {
      // Inside the outline everything differs by FAR, the rest of the grid by SOFT: a shift taken from the outline alone
      // would be FAR and would take the site out.
      const p = pair(G, (x, y) => (block(x, y) ? same(FAR) : same(SOFT)))
      const r = changed(run(p, G, { inside: mask(G, block) }))
      expect(r.shift).toEqual([SOFT, SOFT, SOFT])
      expect(r.patches).toBe(1)
      expect(r.hectares).toBeCloseTo(ha(1600), 6)
    })
    const leftCols = Math.floor(SIZE * 0.3)
    const left = rect(0, 0, leftCols, SIZE)
    it('takes the share of clear ground over the outline: cloud outside it does not count against it', () => {
      const p = pair(G)
      const r = run({ first: p.first, last: clouded(p.last, G, (x, y) => !left(x, y)) }, G, {
        inside: mask(G, left),
      })
      expect(r.state).toBe('nothing')
      expect(r.clearPixels).toBe(leftCols * SIZE)
    })
    it('takes the share of clear ground over the outline: cloud inside it does', () => {
      const cloud = rect(Math.floor(leftCols * 0.4), 0, SIZE, SIZE) // the outer 60% of the outline, and all beyond it
      const p = pair(G)
      const r = run({ first: p.first, last: clouded(p.last, G, cloud) }, G, { inside: mask(G, left) })
      expect(r.state).toBe('not-enough-ground')
    })
    it('says there is not enough ground for an empty outline', () => {
      expect(run(site, G, { inside: mask(G, () => false) }).state).toBe('not-enough-ground')
    })
  })

  describe('hectares come from the ground size of the grid', () => {
    // Pixels of 5 m on the ground at 19 and 60 degrees north: Mercator metres are 1/cos(lat) longer, which would give about
    // 1.1 and 4 times the area.
    it.each([19, 60])('at latitude %i', (lat) => {
      const g = gridOf(SIZE, K, lat)
      const r = changed(run(pair(g, only(rect(50, 50, 40, 40), same(FAR))), g))
      expect(r.hectares).toBeCloseTo((1600 * (C.nativeM / K) ** 2) / 10_000, 3)
    })
    it('follows a coarser grid: 1600 pixels of 10 m are 16 ha', () => {
      const g = gridOf(60, 1)
      const r = changed(run(pair(g, only(rect(10, 10, 40, 40), same(FAR))), g))
      expect(r.hectares).toBeCloseTo(16, 3)
    })
  })
})
