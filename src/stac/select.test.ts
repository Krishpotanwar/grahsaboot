import { describe, expect, it } from 'vitest'
import { pointInRing, selectPerDate } from './select.ts'
import type { S2Item } from './types.ts'

const base = (id: string, datetime: string, over: Partial<S2Item> = {}): S2Item => ({
  id,
  collection: 'sentinel-2-l2a',
  datetime,
  date: datetime.slice(0, 10),
  epsg: 32644,
  cloudCover: 10,
  baseline: '05.11',
  nodataPct: 0,
  footprint: [
    [
      [79, 21],
      [79.2, 21],
      [79.2, 21.2],
      [79, 21.2],
      [79, 21],
    ],
  ],
  visual: {
    href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/v',
    transform: [10, 0, 0, 0, -10, 0],
    shape: [1, 1],
  },
  scl: {
    href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/s',
    transform: [20, 0, 0, 0, -20, 0],
    shape: [1, 1],
  },
  ...over,
})
const AOI: [number, number][] = [
  [79.08, 21.14],
  [79.09, 21.14],
  [79.09, 21.15],
]

describe('selectPerDate', () => {
  it('groups by UTC date and prefers covering, low-nodata, low-cloud items', () => {
    const items = [
      base('b2', '2025-01-10T05:31:00Z', { cloudCover: 5 }),
      base('b1', '2025-01-10T05:30:00Z', { cloudCover: 50 }),
      base('edge', '2025-01-10T05:32:00Z', {
        cloudCover: 0,
        footprint: [
          [
            [79.085, 21],
            [79.3, 21],
            [79.3, 21.3],
            [79.085, 21.3],
            [79.085, 21],
          ],
        ],
      }),
      base('c', '2025-02-01T05:30:00Z'),
    ]
    const c = selectPerDate(items, AOI)
    expect(c.map((x) => x.date)).toEqual(['2025-01-10', '2025-02-01'])
    expect(c[0]!.item.id).toBe('b2')
    expect(c[0]!.alternates.map((a) => a.id)).toEqual(['b1', 'edge'])
    expect(c[0]!.coversAoi).toBe(true)
  })
  it('marks dates whose best item does not contain the AOI', () => {
    const c = selectPerDate(
      [
        base('x', '2025-03-01T05:30:00Z', {
          footprint: [
            [
              [80, 22],
              [81, 22],
              [81, 23],
              [80, 22],
            ],
          ],
        }),
      ],
      AOI,
    )
    expect(c[0]!.coversAoi).toBe(false)
  })
  it('pointInRing handles inside/outside', () => {
    const ring: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]
    expect(pointInRing([0.5, 0.5], ring)).toBe(true)
    expect(pointInRing([1.5, 0.5], ring)).toBe(false)
  })
})
