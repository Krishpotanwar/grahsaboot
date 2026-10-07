import type { DisplayGrid } from '../evidence/types.ts'
import { toMercator } from '../evidence/utm.ts'
import type { AoiInput } from '../geo/aoi.ts'

/** The outline as an SVG path in the grid's pixel coordinates (y grows downward): a site's closed ring, or a road's centre line. */
export function outlinePath(aoi: AoiInput, grid: DisplayGrid): string {
  const points = aoi.kind === 'site' ? aoi.geometry.coordinates[0]! : aoi.geometry.coordinates
  const kx = grid.width / (grid.maxX - grid.minX)
  const ky = grid.height / (grid.maxY - grid.minY)
  const px = (v: number) => Math.round(v * 100) / 100
  const d = points
    .map((p, i) => {
      const [x, y] = toMercator(p)
      return `${i ? 'L' : 'M'}${px((x - grid.minX) * kx)} ${px((grid.maxY - y) * ky)}`
    })
    .join('')
  return aoi.kind === 'site' ? `${d}Z` : d
}
