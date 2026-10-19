import { makeDisplayGrid } from '../evidence/display.ts'
import { haversineM } from '../evidence/geodesy.ts'
import type { DisplayGrid } from '../evidence/types.ts'
import type { Bbox } from '../geo/aoi.ts'

/** The Earth radius the rest of the code measures with, as kilometres per degree of latitude. */
const KM_PER_DEG = haversineM([0, 0], [1, 0]) / 1000

/** Width and height in km, the width taken at the latitude of the middle. */
const sidesKm = ([w, s, e, n]: Bbox): [number, number] => [
  (e - w) * KM_PER_DEG * Math.cos((((s + n) / 2) * Math.PI) / 180),
  (n - s) * KM_PER_DEG,
]

/** The region is within the cap the loader plans for (the caller clamps with `regionFor`; this is the loader's own defence). */
export const regionFits = (region: Bbox, maxKm = 12): boolean => Math.max(...sidesKm(region)) <= maxKm + 0.01

/** The view is wider than the picture can cover: its longer side is over `maxKm`. A view that cannot be measured counts as too wide. */
export const viewTooWide = (view: Bbox, maxKm = 12): boolean => !(Math.max(...sidesKm(view)) <= maxKm)

/** The view, cut around its centre to at most `maxKm` on each side; `clamped` when anything was cut. */
export function regionFor(view: Bbox, maxKm = 12): { bbox: Bbox; clamped: boolean } {
  const [wKm, hKm] = sidesKm(view)
  const cut = (lo: number, hi: number, km: number): [number, number] => {
    if (km <= maxKm) return [lo, hi]
    const mid = (lo + hi) / 2
    const half = ((hi - lo) / 2) * (maxKm / km)
    return [mid - half, mid + half]
  }
  const [x0, x1] = cut(view[0], view[2], wKm)
  const [y0, y1] = cut(view[1], view[3], hKm)
  return { bbox: [x0, y0, x1, y1], clamped: wKm > maxKm || hKm > maxKm }
}

/** About two display pixels per 10 m pixel (never fewer than 64 a side, never more than `maxSide`). */
export function gridFor(region: Bbox, maxSide = 1024): DisplayGrid {
  const metres = Math.max(...sidesKm(region)) * 1000
  return makeDisplayGrid(region, Math.min(maxSide, Math.max(64, Math.round((2 * metres) / 10))), 0)
}

/** Full resolution (level 0) up to 10 km on the long side, half resolution (level 1) beyond. */
export const levelFor = (region: Bbox): 0 | 1 => (Math.max(...sidesKm(region)) <= 10 ? 0 : 1)
