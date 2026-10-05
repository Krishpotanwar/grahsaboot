import { fromMercator, toMercator, utmConverter } from './utm.ts'
import type { DisplayGrid, LevelInfo, Window } from './types.ts'

export function makeDisplayGrid(
  bbox: [number, number, number, number],
  maxSide: number,
  padFrac = 0.1,
): DisplayGrid {
  const [x0, y0] = toMercator([bbox[0], bbox[1]])
  const [x1, y1] = toMercator([bbox[2], bbox[3]])
  const padX = (x1 - x0) * padFrac
  const padY = (y1 - y0) * padFrac
  const spanX = x1 - x0 + 2 * padX
  const spanY = y1 - y0 + 2 * padY
  const scale = Math.max(spanX, spanY) / maxSide
  const width = Math.max(1, Math.round(spanX / scale))
  const height = Math.max(1, Math.round(spanY / scale))
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const minX = cx - (width * scale) / 2,
    maxX = cx + (width * scale) / 2
  const minY = cy - (height * scale) / 2,
    maxY = cy + (height * scale) / 2
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    cornersLonLat: [
      fromMercator([minX, maxY]),
      fromMercator([maxX, maxY]),
      fromMercator([maxX, minY]),
      fromMercator([minX, minY]),
    ],
  }
}

export interface SourceRaster {
  data: Uint8Array
  width: number
  height: number
  samples: 1 | 3
  win: Window
  lvl: LevelInfo
  epsg: number
  nodataZero: boolean
}

const MESH = 16

/** Maps an output position (pixel units, centres at k+0.5) to continuous source-window coordinates. Exact at 16 px mesh nodes, bilinear between. */
export function sourceCoordMapper(
  grid: DisplayGrid,
  src: Pick<SourceRaster, 'win' | 'lvl' | 'epsg'>,
): (x: number, y: number) => [number, number] {
  const conv = utmConverter(src.epsg)
  const sx = (grid.maxX - grid.minX) / grid.width
  const sy = (grid.maxY - grid.minY) / grid.height
  const mw = Math.ceil(grid.width / MESH) + 1
  const mh = Math.ceil(grid.height / MESH) + 1
  const mx = new Float64Array(mw * mh)
  const my = new Float64Array(mw * mh)
  for (let j = 0; j < mh; j++) {
    for (let i = 0; i < mw; i++) {
      const lonlat = fromMercator([grid.minX + i * MESH * sx, grid.maxY - j * MESH * sy])
      const [ux, uy] = conv.forward([lonlat[0], lonlat[1]]) as [number, number]
      mx[j * mw + i] = (ux - src.lvl.originX) / src.lvl.resX - src.win[0]
      my[j * mw + i] = (src.lvl.originY - uy) / src.lvl.resY - src.win[1]
    }
  }
  return (x, y) => {
    const u = x / MESH,
      v = y / MESH
    const i = Math.min(mw - 2, Math.max(0, Math.floor(u)))
    const j = Math.min(mh - 2, Math.max(0, Math.floor(v)))
    const fu = u - i,
      fv = v - j
    const k = j * mw + i
    const lerp2 = (a: Float64Array) =>
      a[k]! * (1 - fu) * (1 - fv) +
      a[k + 1]! * fu * (1 - fv) +
      a[k + mw]! * (1 - fu) * fv +
      a[k + mw + 1]! * fu * fv
    return [lerp2(mx), lerp2(my)]
  }
}

export function reprojectToGrid(
  src: SourceRaster,
  grid: DisplayGrid,
  mode: 'bilinear' | 'nearest',
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(grid.width * grid.height * 4)
  const map = sourceCoordMapper(grid, src)
  const { data, width: W, height: H, samples: S } = src
  const isNodata = (o: number) =>
    src.nodataZero && data[o] === 0 && (S === 1 || (data[o + 1] === 0 && data[o + 2] === 0))
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const [fx, fy] = map(x + 0.5, y + 0.5)
      if (fx < 0 || fy < 0 || fx >= W || fy >= H) continue
      const o = (y * grid.width + x) * 4
      const ni = Math.floor(fx),
        nj = Math.floor(fy)
      const nearest = (nj * W + ni) * S
      if (isNodata(nearest)) continue
      if (mode === 'nearest' || S === 1) {
        const r = data[nearest]!
        out[o] = r
        out[o + 1] = S === 3 ? data[nearest + 1]! : r
        out[o + 2] = S === 3 ? data[nearest + 2]! : r
        out[o + 3] = 255
        continue
      }
      const gx = fx - 0.5,
        gy = fy - 0.5
      const i0 = Math.floor(gx),
        j0 = Math.floor(gy)
      const ax = gx - i0,
        ay = gy - j0
      const corners = [
        [i0, j0],
        [i0 + 1, j0],
        [i0, j0 + 1],
        [i0 + 1, j0 + 1],
      ].map(([i, j]) => (Math.min(H - 1, Math.max(0, j!)) * W + Math.min(W - 1, Math.max(0, i!))) * S)
      if (corners.some(isNodata)) {
        out.set([data[nearest]!, data[nearest + 1]!, data[nearest + 2]!, 255], o)
        continue
      }
      const wts = [(1 - ax) * (1 - ay), ax * (1 - ay), (1 - ax) * ay, ax * ay]
      for (let b = 0; b < 3; b++) out[o + b] = corners.reduce((acc, c, k) => acc + data[c + b]! * wts[k]!, 0)
      out[o + 3] = 255
    }
  }
  return out
}
