import { toUtm } from './utm.ts'
import type { AoiGeometry, LevelInfo, Window, XY } from './types.ts'

export const MAX_WINDOW_PX = 1100

/** `transform` is a STAC proj:transform in GDAL order [resX, 0, originX, 0, -resY, originY]; `shape` is [rows, cols] of level 0. */
export function levelFromTransform(
  transform: number[],
  shape: [number, number],
  level: number,
  width: number,
  height: number,
): LevelInfo {
  const [a, , c, , e, f] = transform
  if (a === undefined || c === undefined || e === undefined || f === undefined || a <= 0 || e >= 0)
    throw new Error('BAD_TRANSFORM')
  return {
    level,
    width,
    height,
    originX: c,
    originY: f,
    resX: a * (shape[1] / width),
    resY: -e * (shape[0] / height),
  }
}

export function aoiPointsUtm(aoi: AoiGeometry, epsg: number): XY[] {
  if (aoi.kind === 'site') return aoi.rings.flat().map((p) => toUtm(epsg, p))
  const hw = aoi.widthM / 2
  return aoi.line.flatMap((p) => {
    const [x, y] = toUtm(epsg, p)
    return [
      [x - hw, y - hw],
      [x + hw, y - hw],
      [x + hw, y + hw],
      [x - hw, y + hw],
    ] as XY[]
  })
}

export function aoiPixelWindow(
  points: XY[],
  lvl: LevelInfo,
  pad = 2,
): { clamped: Window; full: Window } | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const full: Window = [
    Math.floor((minX - lvl.originX) / lvl.resX) - pad,
    Math.floor((lvl.originY - maxY) / lvl.resY) - pad,
    Math.ceil((maxX - lvl.originX) / lvl.resX) + pad,
    Math.ceil((lvl.originY - minY) / lvl.resY) + pad,
  ]
  const clamped: Window = [
    Math.max(0, full[0]),
    Math.max(0, full[1]),
    Math.min(lvl.width, full[2]),
    Math.min(lvl.height, full[3]),
  ]
  if (clamped[2] <= clamped[0] || clamped[3] <= clamped[1]) return null
  return { clamped, full }
}

export function windowSize(w: Window): { width: number; height: number } {
  return { width: w[2] - w[0], height: w[3] - w[1] }
}

/** Server-side check of a client-declared window: inside the level, not oversized, and covering the AOI within `tol` px. */
export function windowCovers(win: Window, points: XY[], lvl: LevelInfo, tol = 2): boolean {
  const need = aoiPixelWindow(points, lvl, 0)
  if (!need) return false
  const n = need.clamped
  const { width, height } = windowSize(win)
  return (
    win[0] >= 0 &&
    win[1] >= 0 &&
    win[2] <= lvl.width &&
    win[3] <= lvl.height &&
    width > 0 &&
    height > 0 &&
    width <= MAX_WINDOW_PX &&
    height <= MAX_WINDOW_PX &&
    win[0] <= n[0] + tol &&
    win[1] <= n[1] + tol &&
    win[2] >= n[2] - tol &&
    win[3] >= n[3] - tol &&
    win[0] >= n[0] - 10 &&
    win[1] >= n[1] - 10 &&
    win[2] <= n[2] + 10 &&
    win[3] <= n[3] + 10
  )
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
