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

/**
 * A `size` wide and `height` high grid (square when `height` is left out) at `lat` whose display pixels are exactly
 * C.nativeM / k metres on the ground: k display pixels span one native pixel.
 */
function gridOf(size: number, k: number, lat = 21, height = size): DisplayGrid {
  const [cx, cy] = toMercator([79, lat])
  const px = C.nativeM / k / (Math.cos((lat * Math.PI) / 180) * GROUND_PER_MERC)
  const [halfX, halfY] = [(size * px) / 2, (height * px) / 2]
  const [minX, maxX, minY, maxY] = [cx - halfX, cx + halfX, cy - halfY, cy + halfY]
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: size,
    height,
    cornersLonLat: [
      fromMercator([minX, maxY]),
      fromMercator([maxX, maxY]),
      fromMercator([maxX, minY]),
      fromMercator([minX, minY]),
    ],
  }
}

/**
 * Ground metres on a side of a display pixel by the Mercator scale: its Mercator size shrunk by the cosine of the latitude of
 * the grid's middle. The rule measures it another way (the grid's edges, with haversineM), so this is a check on it.
 */
function groundPx(g: DisplayGrid): number {
  const latMid = fromMercator([(g.minX + g.maxX) / 2, (g.minY + g.maxY) / 2])[1]
  return ((g.maxX - g.minX) / g.width) * Math.cos((latMid * Math.PI) / 180) * GROUND_PER_MERC
}

const K = 2 // the grid of the F10 example: about 2 display pixels per 10 m pixel
const SIZE = 140
const G = gridOf(SIZE, K)
const BLOCK = C.blockNative * K // display pixels across a block 30 m wide on G
const AREA_MIN = C.areaMinNative * K * K // display pixels in 0.3 ha on G
/** Native pixels on a side of the smallest square block that makes the area minimum: it counts, with room in width too. */
const SQUARE = Math.ceil(Math.sqrt(C.areaMinNative))
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
const TEXTURE = 23 // the texture runs from 0 to TEXTURE - 1
const texture = (x: number, y: number) => (x * 7 + y * 13) % TEXTURE

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
  if (r.state === 'not-enough-ground' || r.state === 'outline-too-small')
    throw new Error(`no shift is estimated for ${r.state}`)
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
        run(p, G, { inside: mask(G, rect(AT, AT, 1, 1)) }),
        run(pair(G, only(rowsOf(0.6), same(FAR)))),
        run(p),
        run(pair(G, only(SITE, same(FAR)))),
      ]
      expect(results.map((r) => r.state)).toEqual([
        'not-enough-ground',
        'outline-too-small',
        'most-differs',
        'nothing',
        'changed',
      ])
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

  describe('the last estimate of the normal shift stands', () => {
    // The shift by the rule's own description, on differences that are equal in all three bands: the lower median of the ones
    // not flagged by the estimate before (the first is over all of them), a difference being flagged when it is farther than
    // the band threshold from that estimate.
    const estimates = (diffs: number[], n: number) => {
      const out: number[] = []
      let use = diffs
      for (let i = 0; i < n; i++) {
        const sorted = [...use].sort((a, b) => a - b)
        const s = sorted[(sorted.length - 1) >> 1]!
        out.push(s)
        use = diffs.filter((d) => Math.abs(d - s) <= C.bandThreshold)
      }
      return out
    }
    it('is the last of its estimates: the third still moves it, and a fourth would move it again', () => {
      // 21 pixels in five groups, spread so that each estimate lands on a different group than the one before it
      const groups: Array<[number, number]> = [
        [0.26, 9], // [the difference as a share of the band threshold, pixels]
        [1.37, 2],
        [2.21, 3],
        [2.47, 1],
        [2.84, 6],
      ]
      const diffs = groups.flatMap(([share, n]) => Array<number>(n).fill(Math.round(share * C.bandThreshold)))
      expect(diffs).toHaveLength(21)
      expect(Math.max(...diffs) + BASE + TEXTURE - 1).toBeLessThanOrEqual(255) // no pixel clamps
      const est = estimates(diffs, C.passes + 1)
      for (let i = 1; i < est.length; i++) expect(est[i]).not.toBe(est[i - 1]) // the premise: every estimate moves the shift
      const g = gridOf(7, K, 21, 3) // 21 pixels
      const r = withShift(
        run(
          pair(g, (x, y) => same(diffs[y * 7 + x]!)),
          g,
        ),
      )
      const last = est[C.passes - 1]!
      expect(r.shift).toEqual([last, last, last])
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
    // The shift can go either way: the later picture lighter (haze) or darker (shadow, a drier season).
    it.each([0, 1, 2])(
      'is said when the final shift reaches the limit in band %i alone, in either direction, and not one below',
      (b) => {
        for (const sign of [1, -1]) {
          expect(run(pair(G, () => inBand(b, sign * C.shiftLimit))).state).toBe('most-differs')
          expect(run(pair(G, () => inBand(b, sign * (C.shiftLimit - 1)))).state).toBe('nothing')
        }
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
    it('is said at exactly half flagged: half +x and half -x, with x under the band threshold and under the shift limit', () => {
      // x is over half the band threshold, so the two halves are more than the threshold apart; it is under the threshold
      // itself and under the shift limit, so neither the raw differences nor the shift can trip the other two branches.
      const x = Math.floor(C.bandThreshold / 2) + 1
      expect(2 * x).toBeGreaterThan(C.bandThreshold)
      expect(x).toBeLessThan(C.bandThreshold)
      expect(x).toBeLessThan(C.shiftLimit)
      const g = gridOf(10, K)
      const half = 100 * C.flaggedShare // exactly the share
      // `up` pixels at +x and the rest at -x: the lower median is -x until `up` passes half, and the pixels on the other side
      // of it are the flagged ones
      const split = (up: number) =>
        run(
          pair(g, (cx, cy) => same(cy * 10 + cx < up ? x : -x)),
          g,
        )
      expect(split(half).state).toBe('most-differs') // the 50 at +x are flagged: exactly the share
      expect(split(half - 1).state).toBe('nothing') // 49 flagged
      expect(split(half + 1).state).toBe('nothing') // the median turns to +x, and the 49 at -x are the flagged ones
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
    it('counts a road exactly as wide as the block', () => {
      expect(C.blockNative * 40).toBeGreaterThanOrEqual(C.areaMinNative) // long enough for the area
      const r = changed(run(pair(G, only(rect(10, 10, C.blockNative * K, 40 * K), same(FAR)))))
      expect(r.patches).toBe(1)
      expect(r.hectares).toBeCloseTo(ha(C.blockNative * K * 40 * K), 6)
    })
    it('counts a square block that makes the area minimum', () => {
      expect(SQUARE).toBeGreaterThanOrEqual(C.blockNative) // wide enough as well
      const r = changed(run(pair(G, only(rect(10, 10, SQUARE * K, SQUARE * K), same(FAR)))))
      expect(r.patches).toBe(1)
      expect(r.hectares).toBeCloseTo(ha(SQUARE * K * SQUARE * K), 6)
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
      const rows = Math.ceil(AREA_MIN / (2 * BLOCK)) // two blocks BLOCK wide and `rows` high make the minimum, one does not
      const a = rect(10, 10, BLOCK, rows)
      const b = rect(10 + BLOCK, 10 + rows, BLOCK, rows) // starts where a ends, one column over: they meet at a corner only
      expect(BLOCK * rows).toBeLessThan(AREA_MIN) // each alone is under the minimum
      expect(2 * BLOCK * rows).toBeGreaterThanOrEqual(AREA_MIN) // together they are not
      const r = changed(run(pair(G, only(either(a, b), same(FAR)))))
      expect(r.patches).toBe(1)
      expect(r.hectares).toBeCloseTo(ha(2 * BLOCK * rows), 6)
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
      const side = SQUARE * K // a square block that makes the area minimum
      const edge = rect(SIZE - side, SIZE - side, side, side)
      const r = changed(run(pair(G, only(either(edge, rect(0, 0, side, side)), same(FAR)))))
      expect(r.patches).toBe(2)
      expect(r.hectares).toBeCloseTo(ha(2 * side * side), 6)
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
      expect(changed(at(SQUARE, SQUARE)).hectares).toBeCloseTo(nativeHa(SQUARE, SQUARE), 6)
      expect(at(side, side).state).toBe('nothing') // under the area minimum
      expect(changed(at(C.blockNative, len)).hectares).toBeCloseTo(nativeHa(C.blockNative, len), 6) // exactly the minimum
      expect(at(C.blockNative, len - 1).state).toBe('nothing')
    })

    // On the real 2 km grid (about 400 by 400) a display pixel is about 5.5 m, not 5 m (makeDisplayGrid pads every side by
    // 100 m): the minimums are rounded up, so a counted patch is never under the block width or the area minimum.
    const DLAT = 2 / (haversineM([0, 0], [1, 0]) / 1000)
    const DLON = DLAT / Math.cos((21.1458 * Math.PI) / 180)
    const REAL = makeDisplayGrid(
      [79.0882 - DLON / 2, 21.1458 - DLAT / 2, 79.0882 + DLON / 2, 21.1458 + DLAT / 2],
      400,
      0,
    )
    it('rounds the width and the area up on the real grid', () => {
      const px = groundPx(REAL)
      const blockM = C.blockNative * C.nativeM // metres across
      const areaM2 = C.areaMinNative * C.nativeM ** 2 // square metres
      const blockPx = Math.ceil(blockM / px) // the narrowest strip that is at least blockM across
      const areaPx = Math.ceil(areaM2 / px ** 2) // the fewest pixels that make at least areaM2
      const rowsUnder = Math.floor((areaPx - 1) / blockPx) // a strip a block wide that falls just short of the area ...
      const rowsOver = Math.ceil(areaPx / blockPx) // ... and one that just makes it
      // the premises: the pixel does not divide the minimums evenly (so rounding matters), and the strips are on either side
      expect(blockPx * px).toBeGreaterThan(blockM)
      expect((blockPx - 1) * px).toBeLessThan(blockM)
      expect(blockPx * rowsUnder * px ** 2).toBeLessThan(areaM2)
      expect(blockPx * rowsOver * px ** 2).toBeGreaterThanOrEqual(areaM2)
      const at = (w: number, h: number) => run(pair(REAL, only(rect(50, 50, w, h), same(FAR))), REAL)
      expect(at(blockPx - 1, 60).state).toBe('nothing') // too narrow, though long
      expect(at(blockPx, 60).state).toBe('changed')
      expect(at(blockPx, rowsUnder).state).toBe('nothing') // wide enough, but a little short of the area
      expect(at(blockPx, rowsOver).state).toBe('changed')
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
  })

  describe('the outline is too small', () => {
    // An outline that cannot hold a patch at all (0.3 ha that is 30 m across: AREA_MIN pixels, BLOCK across, on G) is said to
    // be, rather than answered "nothing" for a patch that could never pass. With no outline the whole square is meant, which
    // is never too small.
    const rows = AREA_MIN / BLOCK // rows of a block BLOCK wide that make exactly the area minimum
    const site = pair(G, only(SITE, same(FAR)))
    const outline = (w: number, h: number) => mask(G, rect(AT, AT, w, h)) // inside the site, all of it changed

    it('is said when the outline holds fewer pixels than the area minimum', () => {
      expect(Number.isInteger(rows)).toBe(true) // the fixture needs whole rows: rebuild it if the minimum changes
      const r = run(site, G, { inside: outline(BLOCK, rows - 1) })
      expect(r.state).toBe('outline-too-small')
      expect(r).not.toHaveProperty('shift')
      expect(r).not.toHaveProperty('patches')
      expect(r).not.toHaveProperty('hectares')
      expect(r.clearPixels).toBe(BLOCK * (rows - 1))
      expect(run(site, G, { inside: outline(1, 1) }).state).toBe('outline-too-small')
    })
    it('is not said at exactly the area minimum: the same site is counted in full', () => {
      const r = changed(run(site, G, { inside: outline(BLOCK, rows) }))
      expect(r.patches).toBe(1)
      expect(r.hectares).toBeCloseTo(ha(AREA_MIN), 6)
    })
    it('is never said when there is no outline, not even on a grid smaller than the area minimum', () => {
      const side = Math.floor(Math.sqrt(AREA_MIN - 1))
      const g = gridOf(side, K) // a grid of fewer pixels than the area minimum
      expect(g.width * g.height).toBeLessThan(AREA_MIN)
      expect(run(pair(g), g).state).toBe('nothing')
      expect(run(site).state).toBe('changed')
    })
    it('is said for an outline with the area but not the width: narrower than a block, however long', () => {
      const thin = mask(G, rect(AT, 10, K, 120)) // one native pixel wide, 240 pixels
      expect(240).toBeGreaterThanOrEqual(AREA_MIN)
      expect(run(pair(G), G, { inside: thin }).state).toBe('outline-too-small')
      const road = mask(G, rect(AT, 10, BLOCK, 120)) // a block wide: 720 pixels hold the blocks
      expect(run(pair(G), G, { inside: road }).state).toBe('nothing')
    })
    it('is said for an empty outline, which holds no ground at all', () => {
      const r = run(site, G, { inside: mask(G, () => false) })
      expect(r.state).toBe('outline-too-small')
      expect(r.clearPixels).toBe(0)
    })
    it('comes after not-enough-ground, and before most-differs', () => {
      const tiny = outline(BLOCK, rows - 1)
      const shifted = pair(G, () => same(C.shiftLimit))
      expect(run(shifted).state).toBe('most-differs')
      expect(run(shifted, G, { inside: tiny }).state).toBe('outline-too-small')
      const cloudy = { first: shifted.first, last: clouded(shifted.last, G, allOf(G)) }
      expect(run(cloudy, G, { inside: tiny }).state).toBe('not-enough-ground')
    })
  })

  describe('a grid that is not square', () => {
    // Width and height are each used for their own axis: the pixel size comes from the width, the rows from the height.
    it.each([
      { w: 100, h: 160 },
      { w: 160, h: 100 },
    ])(
      'reads a $w by $h grid: a site, its outline, a road along each axis, a line along neither',
      ({ w, h }) => {
        const g = gridOf(w, K, 21, h)
        const on = (where: Where, extra: Partial<ChangeInput> = {}) =>
          run(pair(g, only(where, same(FAR))), g, extra)
        const site = rect(10, 20, 40, 60)
        expect(changed(on(site)).hectares).toBeCloseTo(ha(40 * 60), 6)
        expect(changed(on(site, { inside: mask(g, site) })).hectares).toBeCloseTo(ha(40 * 60), 6) // through the outline too
        const tall = rect(w - 20, 10, BLOCK, h - 20) // a block wide, the whole height but the margins
        const wide = rect(10, h - 20, w - 20, BLOCK) // a block high, the whole width but the margins
        expect(changed(on(tall)).hectares).toBeCloseTo(ha(BLOCK * (h - 20)), 6)
        expect(changed(on(wide)).hectares).toBeCloseTo(ha((w - 20) * BLOCK), 6)
        expect(on(rect(w - 20, 10, K, h - 20)).state).toBe('nothing') // a line one native pixel wide, upright
        expect(on(rect(10, h - 20, w - 20, K)).state).toBe('nothing') // and lying
      },
    )
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
