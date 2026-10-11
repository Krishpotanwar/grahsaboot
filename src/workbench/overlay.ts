import { haversineM } from '../evidence/geodesy.ts'
import type { DisplayGrid, LonLat } from '../evidence/types.ts'
import { toMercator } from '../evidence/utm.ts'
import type { AoiInput } from '../geo/aoi.ts'

/** Longitude/latitude to the grid's pixel coordinates (y grows downward). */
function toPx(grid: DisplayGrid) {
  const kx = grid.width / (grid.maxX - grid.minX)
  const ky = grid.height / (grid.maxY - grid.minY)
  return (p: LonLat): [number, number] => {
    const [x, y] = toMercator(p)
    return [(x - grid.minX) * kx, (grid.maxY - y) * ky]
  }
}

/** The outline as an SVG path in the grid's pixel coordinates (y grows downward): a site's closed ring, or a road's centre line. */
export function outlinePath(aoi: AoiInput, grid: DisplayGrid): string {
  const points = aoi.kind === 'site' ? aoi.geometry.coordinates[0]! : aoi.geometry.coordinates
  const at = toPx(grid)
  const px = (v: number) => Math.round(v * 100) / 100
  const d = points
    .map((p, i) => {
      const [x, y] = at(p)
      return `${i ? 'L' : 'M'}${px(x)} ${px(y)}`
    })
    .join('')
  return aoi.kind === 'site' ? `${d}Z` : d
}

/**
 * The point `distM` metres along a road's line, in the grid's pixel coordinates; before the start and past the end it is the
 * nearest end. Metres are measured as the sections are (`partsOf`: haversine, straight between vertices), so a section's middle
 * is `(fromM + toM) / 2`.
 */
export function pointAlong(line: LonLat[], grid: DisplayGrid, distM: number): [number, number] {
  const at = toPx(grid)
  let left = Math.max(0, distM)
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!
    const b = line[i]!
    const seg = haversineM(a, b)
    if (left <= seg || i === line.length - 1) {
      const t = seg > 0 ? Math.min(1, left / seg) : 0
      return at([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
    left -= seg
  }
  return at(line[0]!)
}
