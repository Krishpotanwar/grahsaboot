import { describe, expect, it } from 'vitest'
import { aoiPixelWindow, aoiPointsUtm, levelFromTransform, sha256Hex, windowCovers } from './frame.ts'
import type { XY } from './types.ts'

// UTM 44N ring of the Nagpur ±0.005° square (proj4 2.22.0, 2026-10-05)
const RING_UTM: XY[] = [
  [300949.012, 2338931.647],
  [301987.753, 2338919.142],
  [302001.051, 2340026.345],
  [300962.38, 2340038.855],
  [300949.012, 2338931.647],
]
const REAL = [10, 0, 199980, 0, -10, 2400000]
const FIXTURE = [10, 0, 300000, 0, -10, 2341000]

describe('levelFromTransform', () => {
  it('reads GDAL-order transforms and scales overviews', () => {
    expect(levelFromTransform(REAL, [10980, 10980], 0, 10980, 10980)).toEqual({
      level: 0,
      width: 10980,
      height: 10980,
      originX: 199980,
      originY: 2400000,
      resX: 10,
      resY: 10,
    })
    expect(levelFromTransform(REAL, [10980, 10980], 1, 5490, 5490).resX).toBe(20)
  })
})

describe('aoiPixelWindow', () => {
  it('matches the real tile 44QKJ at 10 m and 20 m', () => {
    expect(
      aoiPixelWindow(RING_UTM, levelFromTransform(REAL, [10980, 10980], 0, 10980, 10980))?.clamped,
    ).toEqual([10094, 5994, 10205, 6111])
    expect(
      aoiPixelWindow(RING_UTM, levelFromTransform(REAL, [10980, 10980], 1, 5490, 5490))?.clamped,
    ).toEqual([5046, 2996, 5104, 3057])
  })
  it('matches the fixture scene', () => {
    expect(aoiPixelWindow(RING_UTM, levelFromTransform(FIXTURE, [256, 256], 0, 256, 256))?.clamped).toEqual([
      92, 94, 203, 211,
    ])
  })
  it('clamps partial overlap and returns null when fully outside', () => {
    const lvl = levelFromTransform(FIXTURE, [256, 256], 0, 256, 256)
    const shifted: XY[] = RING_UTM.map(([x, y]) => [x + 1500, y])
    const w = aoiPixelWindow(shifted, lvl)!
    expect(w.clamped[2]).toBe(256)
    expect(w.full[2]).toBeGreaterThan(256)
    expect(
      aoiPixelWindow(
        RING_UTM.map(([x, y]) => [x + 9000, y] as XY),
        lvl,
      ),
    ).toBeNull()
  })
})

describe('windowCovers', () => {
  const lvl = levelFromTransform(FIXTURE, [256, 256], 0, 256, 256)
  it('accepts the exact window and rejects shifted or oversized ones', () => {
    expect(windowCovers([92, 94, 203, 211], RING_UTM, lvl)).toBe(true)
    expect(windowCovers([97, 94, 208, 211], RING_UTM, lvl)).toBe(false)
    expect(windowCovers([92, 94, 300, 211], RING_UTM, lvl)).toBe(false)
  })
})

describe('aoiPointsUtm', () => {
  it('expands road vertices by half the width', () => {
    const pts = aoiPointsUtm(
      {
        kind: 'road',
        line: [
          [79.0882, 21.1458],
          [79.09, 21.15],
        ],
        widthM: 30,
      },
      32644,
    )
    const xs = pts.map((p) => p[0])
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(30)
    expect(pts).toHaveLength(8)
  })
})

describe('sha256Hex', () => {
  it('matches reference vectors', async () => {
    expect(await sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(await sha256Hex(Uint8Array.from({ length: 256 }, (_, i) => i))).toBe(
      '40aff2e9d2d8922e47afd4648e6967497158785fbd1da870e7110266bf944880',
    )
  })
})
