import type { QualityLabel, QualityStats } from './types.ts'

const VALID = [4, 5, 6]
/** 2 dark area / topographic shadow, 7 unclassified: visible ground the classifier could not name. Older processing
 * baselines (Earth Search 2017–21) put most clear, bright construction ground here, so it counts as clear view. */
const UNCERTAIN = [2, 7]
const OBSTRUCTED = [1, 3, 8, 9, 10, 11]

export const isClearClass = (c: number) => c === 2 || (c >= 4 && c <= 7)

export function labelFor(clear: number, nodata: number, total: number): QualityLabel {
  if (total === 0 || nodata >= 0.5) return 'NOT_COVERED'
  if (clear >= 0.95) return 'CLEAR'
  if (clear <= 0.05) return 'OBSCURED'
  return 'PARTIAL'
}

/** `classes` is the SCL window (winW×winH); `mask` is rasterizeAoi(..., sub) for the same window. */
export function sclStats(
  classes: Uint8Array,
  winW: number,
  winH: number,
  mask: Uint8Array,
  sub: number,
  outsideCount = 0,
): QualityStats {
  const counts = new Array<number>(12).fill(0)
  const mw = winW * sub
  for (let r = 0; r < winH * sub; r++) {
    const rowBase = Math.floor(r / sub) * winW
    for (let c = 0; c < mw; c++) {
      if (!mask[r * mw + c]) continue
      const cls = classes[rowBase + Math.floor(c / sub)]!
      counts[cls < 12 ? cls : 0] += 1
    }
  }
  counts[0] += outsideCount
  const total = counts.reduce((a, b) => a + b, 0)
  const frac = (ids: number[]) => (total ? ids.reduce((a, i) => a + counts[i]!, 0) / total : 0)
  const validFraction = frac(VALID)
  const uncertainFraction = frac(UNCERTAIN)
  const clearFraction = validFraction + uncertainFraction
  const nodataFraction = frac([0])
  return {
    policy: 'scl-v2',
    counts,
    total,
    clearFraction,
    validFraction,
    uncertainFraction,
    obstructedFraction: frac(OBSTRUCTED),
    nodataFraction,
    label: labelFor(clearFraction, nodataFraction, total),
  }
}
