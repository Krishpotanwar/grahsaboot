import { describe, expect, it } from 'vitest'
import { parseItem } from './parse.ts'

// Trimmed real Earth Search item (2026-10-05 response for Nagpur).
const REAL = {
  id: 'S2B_44QKJ_20260902_0_L2A',
  collection: 'sentinel-2-l2a',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [78.0, 20.6],
        [79.2, 20.6],
        [79.2, 21.7],
        [78.0, 21.7],
        [78.0, 20.6],
      ],
    ],
  },
  properties: {
    'proj:epsg': 32644,
    datetime: '2026-09-02T05:32:56.964000Z',
    'eo:cloud_cover': 99.363446,
    's2:processing_baseline': '05.12',
    's2:nodata_pixel_percentage': 12.416402,
  },
  assets: {
    visual: {
      href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/44/Q/KJ/2026/9/S2B_44QKJ_20260902_0_L2A/TCI.tif',
      'proj:shape': [10980, 10980],
      'proj:transform': [10, 0, 199980, 0, -10, 2400000],
    },
    scl: {
      href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/44/Q/KJ/2026/9/S2B_44QKJ_20260902_0_L2A/SCL.tif',
      'proj:shape': [5490, 5490],
      'proj:transform': [20, 0, 199980, 0, -20, 2400000],
    },
  },
}

describe('parseItem', () => {
  it('parses a real Earth Search item', () => {
    const it = parseItem(REAL, 'sentinel-2-l2a')
    expect(it).toMatchObject({
      id: REAL.id,
      date: '2026-09-02',
      epsg: 32644,
      cloudCover: 99.363446,
      baseline: '05.12',
      nodataPct: 12.416402,
    })
    expect(it?.visual.transform).toEqual([10, 0, 199980, 0, -10, 2400000])
    expect(it?.scl.shape).toEqual([5490, 5490])
  })
  it('accepts proj:code and uppercase SCL (Planetary Computer)', () => {
    const pc = structuredClone(REAL) as Record<string, any>
    delete pc.properties['proj:epsg']
    pc.properties['proj:code'] = 'EPSG:32644'
    pc.assets.SCL = pc.assets.scl
    delete pc.assets.scl
    pc.assets.visual.href = 'https://sentinel2l2a01.blob.core.windows.net/sentinel2-l2/44/Q/KJ/x/TCI.tif'
    pc.assets.SCL.href = 'https://sentinel2l2a01.blob.core.windows.net/sentinel2-l2/44/Q/KJ/x/SCL.tif'
    expect(parseItem(pc, 'pc:sentinel-2-l2a')?.epsg).toBe(32644)
  })
  it('rejects items without assets, with bad dates, or with non-allowlisted hosts', () => {
    expect(parseItem({ ...REAL, assets: {} }, 'sentinel-2-l2a')).toBeNull()
    expect(
      parseItem({ ...REAL, properties: { ...REAL.properties, datetime: 'nope' } }, 'sentinel-2-l2a'),
    ).toBeNull()
    const evil = structuredClone(REAL)
    evil.assets.visual.href = 'https://evil.example.com/TCI.tif'
    expect(parseItem(evil, 'sentinel-2-l2a')).toBeNull()
  })
})
