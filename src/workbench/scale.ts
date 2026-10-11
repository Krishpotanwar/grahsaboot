import type { DisplayGrid } from '../evidence/types.ts'

/** Bar lengths worth printing, in metres: 50, 100, 200, 500 m, then 1, 2, 5, 10 km. */
const NICE_M = [50, 100, 200, 500, 1000, 2000, 5000, 10000]

/** Ground metres across the photo. The grid is in web-mercator metres, which are 1 / cos(latitude) longer than ground metres. */
export function groundWidthM(grid: DisplayGrid): number {
  const lat = (grid.cornersLonLat[0][1] + grid.cornersLonLat[2][1]) / 2 // north-west and south-east corners
  return (grid.maxX - grid.minX) * Math.cos((lat * Math.PI) / 180)
}

/**
 * The scale bar of a photo: the longest nice length that is at most a quarter of its width (so 10-25 % of it, the steps being
 * 2x or 2.5x), and the share of the photo's width it fills. Photos narrower than 200 m still get the 50 m bar.
 */
export function scaleBar(grid: DisplayGrid): { m: number; share: number } {
  const width = groundWidthM(grid)
  const m = NICE_M.findLast((n) => n <= width / 4) ?? NICE_M[0]!
  return { m, share: m / width }
}
