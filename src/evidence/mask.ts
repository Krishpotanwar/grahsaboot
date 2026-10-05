import { toUtm } from './utm.ts'
import type { AoiGeometry, LevelInfo, Window, XY } from './types.ts'

/**
 * Rasterise an AOI onto `sub`×`sub` cells per pixel of `win` (pixel-centre rule).
 * Sites: even-odd scanline fill (holes respected). Roads: distance to the centreline ≤ width/2, flat end caps.
 * Works for windows that extend outside the scene (pure geometry).
 */
export function rasterizeAoi(
  aoi: AoiGeometry,
  epsg: number,
  win: Window,
  lvl: LevelInfo,
  sub = 1,
): Uint8Array {
  const w = (win[2] - win[0]) * sub
  const h = (win[3] - win[1]) * sub
  const mask = new Uint8Array(Math.max(0, w * h))
  const cellX = lvl.resX / sub
  const cellY = lvl.resY / sub
  const x0 = lvl.originX + win[0] * lvl.resX
  const y0 = lvl.originY - win[1] * lvl.resY
  if (aoi.kind === 'site') {
    fillEvenOdd(
      mask,
      w,
      h,
      x0,
      y0,
      cellX,
      cellY,
      aoi.rings.map((r) => r.map((p) => toUtm(epsg, p))),
    )
  } else {
    fillCorridor(
      mask,
      w,
      h,
      x0,
      y0,
      cellX,
      cellY,
      aoi.line.map((p) => toUtm(epsg, p)),
      aoi.widthM / 2,
    )
  }
  return mask
}

export function countMask(mask: Uint8Array): number {
  let n = 0
  for (let i = 0; i < mask.length; i++) n += mask[i]!
  return n
}

function fillEvenOdd(
  mask: Uint8Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  cellX: number,
  cellY: number,
  rings: XY[][],
) {
  const xs: number[] = []
  for (let r = 0; r < h; r++) {
    const cy = y0 - (r + 0.5) * cellY
    xs.length = 0
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!
        const [xj, yj] = ring[j]!
        if (yi > cy !== yj > cy) xs.push(xi + ((cy - yi) / (yj - yi)) * (xj - xi))
      }
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const cStart = Math.max(0, Math.ceil((xs[k]! - x0) / cellX - 0.5))
      const cEnd = Math.min(w - 1, Math.ceil((xs[k + 1]! - x0) / cellX - 0.5) - 1)
      for (let c = cStart; c <= cEnd; c++) mask[r * w + c] = 1
    }
  }
}

function fillCorridor(
  mask: Uint8Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  cellX: number,
  cellY: number,
  line: XY[],
  hw: number,
) {
  const last = line.length - 2
  for (let s = 0; s <= last; s++) {
    const [ax, ay] = line[s]!
    const [bx, by] = line[s + 1]!
    const dx = bx - ax,
      dy = by - ay
    const len2 = dx * dx + dy * dy
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - hw - x0) / cellX))
    const c1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + hw - x0) / cellX))
    const r0 = Math.max(0, Math.floor((y0 - Math.max(ay, by) - hw) / cellY))
    const r1 = Math.min(h - 1, Math.ceil((y0 - Math.min(ay, by) + hw) / cellY))
    for (let r = r0; r <= r1; r++) {
      const py = y0 - (r + 0.5) * cellY
      for (let c = c0; c <= c1; c++) {
        const idx = r * w + c
        if (mask[idx]) continue
        const px = x0 + (c + 0.5) * cellX
        let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
        if ((s === 0 && t < 0) || (s === last && t > 1)) continue // flat caps at both ends of the line
        t = t < 0 ? 0 : t > 1 ? 1 : t // round joins between segments
        const ex = ax + t * dx - px
        const ey = ay + t * dy - py
        if (ex * ex + ey * ey <= hw * hw) mask[idx] = 1
      }
    }
  }
}
