export interface TiffLevel {
  width: number
  height: number
  samples: 1 | 3
  data: Uint8Array
  tile: number
}
export interface GeoInfo {
  epsg: number
  originX: number
  originY: number
  resX: number
  resY: number
}

type Entry = [tag: number, type: 3 | 4 | 12, values: number[]]
const TYPE_SIZE = { 3: 2, 4: 4, 12: 8 } as const

/** Minimal little-endian, uncompressed, tiled, multi-IFD GeoTIFF writer (level 0 carries the georeferencing). */
export function writeTiledTiff(levels: TiffLevel[], geo: GeoInfo): Uint8Array {
  const chunks: Uint8Array[] = []
  const header = new Uint8Array(8)
  header.set([0x49, 0x49, 42, 0])
  chunks.push(header)
  let offset = 8
  const ifdOffsets: number[] = []
  const nextPointers: number[] = []
  levels.forEach((L, li) => {
    const tilesX = Math.ceil(L.width / L.tile)
    const tilesY = Math.ceil(L.height / L.tile)
    const tileBytes = L.tile * L.tile * L.samples
    const offsets: number[] = []
    const counts: number[] = []
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const t = new Uint8Array(tileBytes)
        for (let y = 0; y < L.tile && ty * L.tile + y < L.height; y++) {
          for (let x = 0; x < L.tile && tx * L.tile + x < L.width; x++) {
            const src = ((ty * L.tile + y) * L.width + tx * L.tile + x) * L.samples
            t.set(L.data.subarray(src, src + L.samples), (y * L.tile + x) * L.samples)
          }
        }
        offsets.push(offset)
        counts.push(tileBytes)
        chunks.push(t)
        offset += tileBytes
      }
    }
    const entries: Entry[] = [
      [254, 4, [li === 0 ? 0 : 1]],
      [256, 4, [L.width]],
      [257, 4, [L.height]],
      [258, 3, Array(L.samples).fill(8)],
      [259, 3, [1]],
      [262, 3, [L.samples === 3 ? 2 : 1]],
      [277, 3, [L.samples]],
      [284, 3, [1]],
      [322, 4, [L.tile]],
      [323, 4, [L.tile]],
      [324, 4, offsets],
      [325, 4, counts],
      [339, 3, Array(L.samples).fill(1)],
    ]
    if (li === 0) {
      entries.push([33550, 12, [geo.resX, geo.resY, 0]])
      entries.push([33922, 12, [0, 0, 0, geo.originX, geo.originY, 0]])
      entries.push([34735, 3, [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, geo.epsg]])
    }
    entries.sort((a, b) => a[0] - b[0])
    const ifdSize = 2 + entries.length * 12 + 4
    const ifdStart = offset
    let extra = ifdStart + ifdSize
    const ifd = new Uint8Array(ifdSize)
    const dv = new DataView(ifd.buffer)
    const extras: Uint8Array[] = []
    dv.setUint16(0, entries.length, true)
    entries.forEach(([tag, type, values], k) => {
      const p = 2 + k * 12
      dv.setUint16(p, tag, true)
      dv.setUint16(p + 2, type, true)
      dv.setUint32(p + 4, values.length, true)
      const size = TYPE_SIZE[type] * values.length
      const write = (view: DataView, at: number) =>
        values.forEach((v, i) => {
          if (type === 3) view.setUint16(at + i * 2, v, true)
          else if (type === 4) view.setUint32(at + i * 4, v, true)
          else view.setFloat64(at + i * 8, v, true)
        })
      if (size <= 4) {
        write(dv, p + 8)
      } else {
        const buf = new Uint8Array(size + (size % 2))
        write(new DataView(buf.buffer), 0)
        dv.setUint32(p + 8, extra, true)
        extras.push(buf)
        extra += buf.length
      }
    })
    ifdOffsets.push(ifdStart)
    nextPointers.push(ifdStart + ifdSize - 4)
    chunks.push(ifd, ...extras)
    offset = extra
  })
  const out = new Uint8Array(offset)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.length
  }
  const view = new DataView(out.buffer)
  view.setUint32(4, ifdOffsets[0]!, true)
  nextPointers.forEach((p, i) => view.setUint32(p, ifdOffsets[i + 1] ?? 0, true))
  return out
}
