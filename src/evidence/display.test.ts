import { describe, expect, it } from 'vitest'
import { makeDisplayGrid, reprojectToGrid, sourceCoordMapper } from './display.ts'
import { levelFromTransform } from './frame.ts'
import { fromMercator, toUtm } from './utm.ts'

const BBOX: [number, number, number, number] = [79.0832, 21.1408, 79.0932, 21.1508]
const LVL = levelFromTransform([10, 0, 300000, 0, -10, 2341000], [256, 256], 0, 256, 256)
const WIN: [number, number, number, number] = [92, 94, 203, 211]
const W = WIN[2] - WIN[0],
  H = WIN[3] - WIN[1]

function exact(grid: ReturnType<typeof makeDisplayGrid>, x: number, y: number): [number, number] {
  const sx = (grid.maxX - grid.minX) / grid.width
  const lonlat = fromMercator([grid.minX + x * sx, grid.maxY - y * sx])
  const [ux, uy] = toUtm(32644, lonlat)
  return [(ux - LVL.originX) / LVL.resX - WIN[0], (LVL.originY - uy) / LVL.resY - WIN[1]]
}

describe('makeDisplayGrid', () => {
  it('builds square pixels with the longest side = maxSide and padded corners', () => {
    const g = makeDisplayGrid(BBOX, 512)
    expect(Math.max(g.width, g.height)).toBe(512)
    expect((g.maxX - g.minX) / g.width).toBeCloseTo((g.maxY - g.minY) / g.height, 6)
    expect(g.cornersLonLat[0][0]).toBeLessThan(BBOX[0])
    expect(g.cornersLonLat[2][1]).toBeLessThan(BBOX[1])
  })
})

describe('sourceCoordMapper', () => {
  it('stays within 0.05 px of exact proj4 everywhere', () => {
    const g = makeDisplayGrid(BBOX, 512)
    const map = sourceCoordMapper(g, { win: WIN, lvl: LVL, epsg: 32644 })
    for (const [x, y] of [
      [0.5, 0.5],
      [255.5, 300.5],
      [511.5, 20.5],
      [100.5, 470.5],
      [333.5, 333.5],
    ] as const) {
      const [ex, ey] = exact(g, x, y)
      const [mx, my] = map(x, y)
      expect(Math.abs(mx - ex)).toBeLessThan(0.05)
      expect(Math.abs(my - ey)).toBeLessThan(0.05)
    }
  })
})

describe('reprojectToGrid', () => {
  const rgb = new Uint8Array(W * H * 3)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgb.set([x % 256, y % 256, 77], (y * W + x) * 3)

  it('samples the expected source pixel at the grid centre (bilinear)', () => {
    const g = makeDisplayGrid(BBOX, 256)
    const out = reprojectToGrid(
      { data: rgb, width: W, height: H, samples: 3, win: WIN, lvl: LVL, epsg: 32644, nodataZero: true },
      g,
      'bilinear',
    )
    const cx = Math.floor(g.width / 2),
      cy = Math.floor(g.height / 2)
    const [sx, sy] = exact(g, cx + 0.5, cy + 0.5)
    const o = (cy * g.width + cx) * 4
    expect(Math.abs(out[o]! - (sx - 0.5))).toBeLessThanOrEqual(1)
    expect(Math.abs(out[o + 1]! - (sy - 0.5))).toBeLessThanOrEqual(1)
    expect(out[o + 3]).toBe(255)
  })
  it('keeps class codes exact in nearest mode and marks outside pixels transparent', () => {
    const cls = Uint8Array.from({ length: W * H }, (_, i) => (i % W < W / 2 ? 4 : 9))
    const g = makeDisplayGrid([79.07, 21.13, 79.11, 21.17], 128)
    const out = reprojectToGrid(
      { data: cls, width: W, height: H, samples: 1, win: WIN, lvl: LVL, epsg: 32644, nodataZero: false },
      g,
      'nearest',
    )
    const seen = new Set<number>()
    let transparent = 0
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] === 0) transparent++
      else seen.add(out[i]!)
    }
    expect([...seen].sort()).toEqual([4, 9])
    expect(transparent).toBeGreaterThan(0)
  })
  it('makes TCI no-data (0,0,0) transparent', () => {
    const g = makeDisplayGrid(BBOX, 64)
    const out = reprojectToGrid(
      {
        data: new Uint8Array(W * H * 3),
        width: W,
        height: H,
        samples: 3,
        win: WIN,
        lvl: LVL,
        epsg: 32644,
        nodataZero: true,
      },
      g,
      'bilinear',
    )
    expect(out.every((v, i) => i % 4 !== 3 || v === 0)).toBe(true)
  })
})
