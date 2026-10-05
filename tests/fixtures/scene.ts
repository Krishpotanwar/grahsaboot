import { writeTiledTiff } from './tiff.ts'
import type { LonLat } from '../../src/evidence/types.ts'

export const FIXTURE_EPSG = 32644
export const TCI_TRANSFORM = [10, 0, 300000, 0, -10, 2341000]
export const SCL_TRANSFORM = [20, 0, 300000, 0, -20, 2341000]
export const TCI_SHAPE: [number, number] = [256, 256]
export const SCL_SHAPE: [number, number] = [128, 128]

export interface FixtureDate {
  date: string
  scl: (x: number, y: number) => number
  roof: boolean
  cloud: number
}
export const FIXTURE_DATES: FixtureDate[] = [
  { date: '2025-01-10', scl: (x, y) => (x < 16 && y < 16 ? 3 : 5), roof: false, cloud: 1.2 },
  { date: '2025-03-05', scl: (x) => (x >= 74 ? 8 : 5), roof: false, cloud: 48.0 },
  { date: '2025-06-15', scl: () => 9, roof: false, cloud: 99.1 },
  { date: '2025-12-20', scl: () => 4, roof: true, cloud: 0.4 },
]

/** The Nagpur ±0.005° square used across tests (fully inside the fixture extent). */
export const NAGPUR_SQUARE: LonLat[] = [
  [79.0832, 21.1408],
  [79.0932, 21.1408],
  [79.0932, 21.1508],
  [79.0832, 21.1508],
  [79.0832, 21.1408],
]
/** 2.90436 km fixture road = UTM 44N (300300, 2338700) → (302300, 2340800). */
export const FIXTURE_ROAD: LonLat[] = [
  [79.07698, 21.138637],
  [79.095988, 21.157819],
]

export function tciPixel(x: number, y: number, roof: boolean): [number, number, number] {
  if (roof && x >= 140 && x < 170 && y >= 140 && y < 170) return [230, 230, 230]
  return [60 + (x % 32), 90 + (y % 32), 50]
}

export function makeTci(roof: boolean): Uint8Array {
  const [h, w] = TCI_SHAPE
  const l0 = new Uint8Array(w * h * 3)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) l0.set(tciPixel(x, y, roof), (y * w + x) * 3)
  const w1 = w / 2,
    h1 = h / 2
  const l1 = new Uint8Array(w1 * h1 * 3)
  for (let y = 0; y < h1; y++)
    for (let x = 0; x < w1; x++) l1.set(tciPixel(x * 2, y * 2, roof), (y * w1 + x) * 3)
  return writeTiledTiff(
    [
      { width: w, height: h, samples: 3, data: l0, tile: 128 },
      { width: w1, height: h1, samples: 3, data: l1, tile: 128 },
    ],
    { epsg: FIXTURE_EPSG, originX: 300000, originY: 2341000, resX: 10, resY: 10 },
  )
}

export function makeScl(fn: (x: number, y: number) => number): Uint8Array {
  const [h, w] = SCL_SHAPE
  const d = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = fn(x, y)
  return writeTiledTiff([{ width: w, height: h, samples: 1, data: d, tile: 128 }], {
    epsg: FIXTURE_EPSG,
    originX: 300000,
    originY: 2341000,
    resX: 20,
    resY: 20,
  })
}

export const itemId = (date: string) => `S2B_44QKJ_${date.replaceAll('-', '')}_0_L2A`

export function fixtureItem(base: string, d: FixtureDate) {
  return {
    type: 'Feature',
    stac_version: '1.0.0',
    id: itemId(d.date),
    collection: 'sentinel-2-l2a',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [78.9, 21.0],
          [79.3, 21.0],
          [79.3, 21.3],
          [78.9, 21.3],
          [78.9, 21.0],
        ],
      ],
    },
    properties: {
      datetime: `${d.date}T05:30:00.000000Z`,
      'proj:epsg': FIXTURE_EPSG,
      'eo:cloud_cover': d.cloud,
      's2:processing_baseline': '05.11',
      's2:nodata_pixel_percentage': 0,
    },
    assets: {
      visual: {
        href: `${base}/cog/${d.date}/TCI.tif`,
        'proj:transform': TCI_TRANSFORM,
        'proj:shape': TCI_SHAPE,
        type: 'image/tiff; application=geotiff; profile=cloud-optimized',
      },
      scl: {
        href: `${base}/cog/${d.date}/SCL.tif`,
        'proj:transform': SCL_TRANSFORM,
        'proj:shape': SCL_SHAPE,
        type: 'image/tiff; application=geotiff; profile=cloud-optimized',
      },
    },
    links: [],
  }
}

export const toArrayBuffer = (u8: Uint8Array): ArrayBuffer =>
  u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
