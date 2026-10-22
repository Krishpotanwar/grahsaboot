import { describe, expect, it } from 'vitest'
import { CHANGE_CONSTANTS, measureChange } from './change.ts'
import { makeDisplayGrid } from './display.ts'
import { levelFromTransform } from './frame.ts'
import { countMask, rasterizeAoi, rasterizeOnGrid } from './mask.ts'
import type { AoiGeometry, DisplayGrid, LonLat } from './types.ts'
import { fromMercator, toMercator } from './utm.ts'

const LVL10 = levelFromTransform([10, 0, 300000, 0, -10, 2341000], [256, 256], 0, 256, 256)
const SQUARE: LonLat[] = [
  [79.0832, 21.1408],
  [79.0932, 21.1408],
  [79.0932, 21.1508],
  [79.0832, 21.1508],
  [79.0832, 21.1408],
]

describe('rasterizeAoi', () => {
  it('fills the Nagpur square with area within 1 %', () => {
    const mask = rasterizeAoi({ kind: 'site', rings: [SQUARE] }, 32644, [0, 0, 256, 256], LVL10, 1)
    const km2 = (countMask(mask) * 100) / 1e6
    expect(km2).toBeGreaterThan(1.15023 * 0.99)
    expect(km2).toBeLessThan(1.15023 * 1.01)
  })
  it('leaves holes empty (even-odd)', () => {
    const hole: LonLat[] = [
      [79.0857, 21.1433],
      [79.0907, 21.1433],
      [79.0907, 21.1483],
      [79.0857, 21.1483],
      [79.0857, 21.1433],
    ]
    const solid = countMask(rasterizeAoi({ kind: 'site', rings: [SQUARE] }, 32644, [0, 0, 256, 256], LVL10))
    const holed = countMask(
      rasterizeAoi({ kind: 'site', rings: [SQUARE, hole] }, 32644, [0, 0, 256, 256], LVL10),
    )
    expect(solid - holed).toBeGreaterThan(2500)
  })
  it('fills a 1 km x 30 m corridor with flat caps', () => {
    // straight east-west line in UTM 44N, 1 km long, inside the fixture extent
    const line: LonLat[] = [
      [79.08, 21.145],
      [79.08965, 21.145],
    ]
    const n = countMask(rasterizeAoi({ kind: 'road', line, widthM: 30 }, 32644, [0, 0, 256, 256], LVL10, 2))
    expect(n * 25).toBeGreaterThan(1000 * 30 * 0.93) // sub=2 → 5 m cells → 25 m² each
    expect(n * 25).toBeLessThan(1000 * 30 * 1.07)
  })
  it('respects sub-sampling (4x cells at sub=2)', () => {
    const a = countMask(rasterizeAoi({ kind: 'site', rings: [SQUARE] }, 32644, [0, 0, 256, 256], LVL10, 1))
    const b = countMask(rasterizeAoi({ kind: 'site', rings: [SQUARE] }, 32644, [0, 0, 256, 256], LVL10, 2))
    expect(b / a).toBeGreaterThan(3.9)
    expect(b / a).toBeLessThan(4.1)
  })
})

// The outline on a display grid (Web Mercator): the `inside` mask the change rule is run with, which the report asks for. Its raster is
// part of how the figure is made, so these tests pin the rule of `rasterizeOnGrid`: pixel centres, even-odd with holes, a corridor
// widened by 1/cos(latitude).
const cellOf = (g: DisplayGrid) => (g.maxX - g.minX) / g.width
/** Ground metres on a side of one display pixel: a Mercator pixel is 1/cos(latitude) larger on the ground than it is drawn. */
const groundPx = (g: DisplayGrid, lat: number) => cellOf(g) * Math.cos((lat * Math.PI) / 180)
const LAT = 21.1458
const SQUARE_BOX: [number, number, number, number] = [79.0832, 21.1408, 79.0932, 21.1508]
// The box of an outline about 2 km across (the fixture road's is such a box): the grid a report of it is drawn on, 1024 pixels long.
const BOX_2KM: [number, number, number, number] = [79.0792, 21.1368, 79.0972, 21.1548]
const groundArea = (mask: Uint8Array, g: DisplayGrid, lat = LAT) => countMask(mask) * groundPx(g, lat) ** 2
const deepFreeze = <T>(v: T): T => {
  if (v && typeof v === 'object') {
    for (const inner of Object.values(v)) deepFreeze(inner)
    Object.freeze(v)
  }
  return v
}

describe('rasterizeOnGrid: a site', () => {
  it('fills the Nagpur square with area within 1 %, on the 400 and the 1024 grid', () => {
    for (const side of [400, 1024]) {
      const grid = makeDisplayGrid(SQUARE_BOX, side)
      const mask = rasterizeOnGrid({ kind: 'site', rings: [SQUARE] }, grid)
      expect(mask).toHaveLength(grid.width * grid.height)
      const km2 = groundArea(mask, grid) / 1e6
      expect(km2, String(side)).toBeGreaterThan(1.15023 * 0.99)
      expect(km2, String(side)).toBeLessThan(1.15023 * 1.01)
    }
  })

  it('agrees with the scene-grid raster of the same outline, which is another projection, for a site and for a road', () => {
    const grid = makeDisplayGrid(BOX_2KM, 1024)
    const road: AoiGeometry = {
      kind: 'road',
      line: [
        [79.0792, 21.1368],
        [79.0972, 21.1548],
      ],
      widthM: 30,
    }
    const site: AoiGeometry = { kind: 'site', rings: [SQUARE] }
    // the scene raster of a road is read at 2.5 m cells, so that its own cell size does not decide the comparison
    for (const [aoi, sub, tolerance] of [
      [site, 1, 0.01],
      [road, 4, 0.03],
    ] as const) {
      const m2 = (countMask(rasterizeAoi(aoi, 32644, [0, 0, 256, 256], LVL10, sub)) * 100) / sub ** 2
      expect(Math.abs(groundArea(rasterizeOnGrid(aoi, grid), grid) / m2 - 1), aoi.kind).toBeLessThan(
        tolerance,
      )
    }
  })

  it('leaves a hole empty (even-odd), as large as the other projection finds it', () => {
    const grid = makeDisplayGrid(SQUARE_BOX, 1024)
    const hole: LonLat[] = [
      [79.0857, 21.1433],
      [79.0907, 21.1433],
      [79.0907, 21.1483],
      [79.0857, 21.1483],
      [79.0857, 21.1433],
    ]
    const solid = rasterizeOnGrid({ kind: 'site', rings: [SQUARE] }, grid)
    const holed = rasterizeOnGrid({ kind: 'site', rings: [SQUARE, hole] }, grid)
    const holeM2 =
      countMask(rasterizeAoi({ kind: 'site', rings: [hole] }, 32644, [0, 0, 256, 256], LVL10)) * 100
    expect(Math.abs((groundArea(solid, grid) - groundArea(holed, grid)) / holeM2 - 1)).toBeLessThan(0.02)
    // the middle of the hole is empty, and a point of the frame around it is not
    const at = (lon: number, lat: number) => {
      const [x, y] = toMercator([lon, lat])
      return holed[
        Math.floor((grid.maxY - y) / cellOf(grid)) * grid.width + Math.floor((x - grid.minX) / cellOf(grid))
      ]
    }
    expect(at(79.0882, 21.1458)).toBe(0)
    expect(at(79.0845, 21.1458)).toBe(1)
  })

  it('takes a pixel when its centre is inside the outline, and never one that is only touched', () => {
    const grid = makeDisplayGrid(SQUARE_BOX, 400)
    const cell = cellOf(grid)
    const [c, r] = [200, 150]
    const centre = [grid.minX + (c + 0.5) * cell, grid.maxY - (r + 0.5) * cell] as const
    /** A rectangle in pixels about the centre of pixel (c, r), as a site. */
    const around = (x0: number, x1: number, y0: number, y1: number): AoiGeometry => ({
      kind: 'site',
      rings: [
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
          [x0, y0],
        ].map(([x, y]) => fromMercator([centre[0] + x * cell, centre[1] + y * cell])),
      ],
    })
    // a fifth of a pixel each way round a centre: that pixel and no other
    const one = rasterizeOnGrid(around(-0.2, 0.2, -0.2, 0.2), grid)
    expect(countMask(one)).toBe(1)
    expect(one[r * grid.width + c]).toBe(1)
    // as thin as that, but between two centres: none, however long it is
    expect(countMask(rasterizeOnGrid(around(0.1, 0.9, -20, 20), grid))).toBe(0)
    expect(countMask(rasterizeOnGrid(around(-20, 20, 0.1, 0.9), grid))).toBe(0)
  })

  it("gives an empty raster of the grid's size for an outline off the grid, and for no ring", () => {
    const grid = makeDisplayGrid(SQUARE_BOX, 400)
    const far: LonLat[] = SQUARE.map(([lon, lat]) => [lon + 1, lat])
    for (const aoi of [
      { kind: 'site', rings: [far] },
      { kind: 'site', rings: [] },
    ] as AoiGeometry[]) {
      const mask = rasterizeOnGrid(aoi, grid)
      expect(mask).toHaveLength(grid.width * grid.height)
      expect(countMask(mask)).toBe(0)
    }
  })

  it('leaves its input as it was (a frozen outline is read, not written) and gives the same raster twice', () => {
    const grid = makeDisplayGrid(SQUARE_BOX, 400)
    const aoi = deepFreeze(structuredClone({ kind: 'site', rings: [SQUARE] } as AoiGeometry))
    expect(rasterizeOnGrid(aoi, grid)).toEqual(rasterizeOnGrid(aoi, grid))
  })
})

describe('rasterizeOnGrid: a road, in ground metres (how many pixels across it is, and what the change rule makes of it)', () => {
  const ROAD_M = 30
  const PHASES = 24
  /** A road about 1 km long, east-west, its centre line `phase` of a pixel up the grid: every way a line can sit on the pixel rows. */
  const eastWest = (grid: DisplayGrid, phase: number, lat = LAT): AoiGeometry => {
    const [x0, y] = toMercator([79.0832, lat])
    const [x1] = toMercator([79.0932, lat])
    const up = phase * cellOf(grid)
    return { kind: 'road', line: [fromMercator([x0, y + up]), fromMercator([x1, y + up])], widthM: ROAD_M }
  }
  /** The same length at 45 degrees, rising to the north-east. */
  const slanted = (grid: DisplayGrid, phase: number): AoiGeometry => {
    const [x0, y] = toMercator([79.0832, LAT])
    const reach = 1000 / Math.cos((LAT * Math.PI) / 180) / Math.SQRT2
    const up = phase * cellOf(grid)
    return {
      kind: 'road',
      line: [fromMercator([x0, y + up]), fromMercator([x0 + reach, y + up + reach])],
      widthM: ROAD_M,
    }
  }
  /** The pixels of the middle column that are set: the road's width in pixels where it crosses it. */
  const across = (mask: Uint8Array, grid: DisplayGrid) => {
    const x = Math.floor(grid.width / 2)
    let n = 0
    for (let r = 0; r < grid.height; r++) n += mask[r * grid.width + x]!
    return n
  }
  /** What the change rule says of an outline on a grid where nothing changed: only the outline can make it say "too small". */
  const verdict = (grid: DisplayGrid, inside: Uint8Array) => {
    const rgba = new Uint8ClampedArray(grid.width * grid.height * 4).fill(128)
    return measureChange({ first: { rgba }, last: { rgba }, grid, inside }).state
  }
  /** The rule's block, in display pixels: its width in metres is the same 30 m, so the road is as wide as one in the ground. */
  const blockPx = (grid: DisplayGrid) =>
    Math.ceil(((CHANGE_CONSTANTS.blockNative * CHANGE_CONSTANTS.nativeM) / groundPx(grid, LAT)) * (1 - 1e-6))
  /** The width in pixels at each of `PHASES` positions, as a count per width, and the rule's verdict for each width that turns up. */
  const record = (grid: DisplayGrid) => {
    const widths = new Map<number, number>()
    const verdicts = new Map<number, string>()
    for (let i = 0; i < PHASES; i++) {
      const mask = rasterizeOnGrid(eastWest(grid, i / PHASES), grid)
      const w = across(mask, grid)
      widths.set(w, (widths.get(w) ?? 0) + 1)
      if (!verdicts.has(w)) verdicts.set(w, verdict(grid, mask))
    }
    return { widths, verdicts }
  }

  it('is as wide on the ground as it is asked to be, at 21 and at 60 degrees north (the half width is widened by 1/cos)', () => {
    for (const lat of [LAT, 60]) {
      const grid = makeDisplayGrid([79.0832, lat - 0.009, 79.0932, lat + 0.009], 1024)
      const [x0] = toMercator([79.0832, lat])
      const [x1] = toMercator([79.0932, lat])
      const expected = (x1 - x0) * Math.cos((lat * Math.PI) / 180) * ROAD_M // its length on the ground times its width
      const area = groundArea(rasterizeOnGrid(eastWest(grid, 0.37, lat), grid), grid, lat)
      expect(area / expected, String(lat)).toBeGreaterThan(0.92)
      expect(area / expected, String(lat)).toBeLessThan(1.08)
    }
  })

  it('is 12 or 13 pixels across on the 1024 grid of a 2 km outline at 21 north, 13 on 78 % of the positions; 12 reads outline-too-small', () => {
    const grid = makeDisplayGrid(BOX_2KM, 1024)
    expect(groundPx(grid, LAT)).toBeGreaterThan(2.3)
    expect(groundPx(grid, LAT)).toBeLessThan(2.4) // 2.35 m: a 30 m road is 12.8 pixels, and the rule's block is 13 (30.5 m)
    expect(blockPx(grid)).toBe(13)
    const { widths, verdicts } = record(grid)
    expect([...widths.keys()].sort((a, b) => a - b)).toEqual([12, 13])
    expect(widths.get(13)! / PHASES).toBeCloseTo(ROAD_M / groundPx(grid, LAT) - 12, 1)
    expect(verdicts.get(12)).toBe('outline-too-small')
    expect(verdicts.get(13)).not.toBe('outline-too-small')
  })

  it("is a whole number of pixels either side of its width on the 400 grid too, and is too small exactly when it is under the rule's block", () => {
    for (const side of [400, 1024]) {
      const grid = makeDisplayGrid(BOX_2KM, side)
      const roadPx = ROAD_M / groundPx(grid, LAT)
      const { widths, verdicts } = record(grid)
      for (const w of widths.keys()) {
        expect([Math.floor(roadPx), Math.ceil(roadPx)], `${side}: ${w}`).toContain(w)
        expect(verdicts.get(w) === 'outline-too-small', `${side}: ${w}`).toBe(w < blockPx(grid))
      }
    }
  })

  it('reads outline-too-small at every position when it runs at 45 degrees, on both grids: no block of this width fits it', () => {
    for (const side of [400, 1024]) {
      const grid = makeDisplayGrid(BOX_2KM, side)
      for (let i = 0; i < 6; i++)
        expect(verdict(grid, rasterizeOnGrid(slanted(grid, i / 6), grid)), `${side} ${i}`).toBe(
          'outline-too-small',
        )
    }
  })

  it('has no pixel for a line of one point, and none for a road off the grid', () => {
    const grid = makeDisplayGrid(BOX_2KM, 400)
    expect(countMask(rasterizeOnGrid({ kind: 'road', line: [[79.0882, LAT]], widthM: ROAD_M }, grid))).toBe(0)
    expect(countMask(rasterizeOnGrid(eastWest(grid, 0, LAT + 1), grid))).toBe(0)
  })
})
