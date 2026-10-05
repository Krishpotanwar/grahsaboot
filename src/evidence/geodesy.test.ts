import { describe, expect, it } from 'vitest'
import { haversineM, lineLengthM, partsOf } from './geodesy.ts'

describe('geodesy', () => {
  it('measures one degree of meridian', () => {
    expect(haversineM([0, 0], [0, 1])).toBeCloseTo(111195.08, 1)
  })
  it('splits a 5.56 km line into 2 km parts that join exactly', () => {
    const line: [number, number][] = [
      [0, 0],
      [0, 0.05],
    ]
    expect(lineLengthM(line)).toBeCloseTo(5559.754, 2)
    const parts = partsOf({ kind: 'road', line, widthM: 30 })
    expect(parts.map((p) => [p.fromM, Math.round(p.toM)])).toEqual([
      [0, 2000],
      [2000, 4000],
      [4000, 5560],
    ])
    for (let i = 1; i < parts.length; i++) {
      const prev = parts[i - 1]!.geometry,
        cur = parts[i]!.geometry
      if (prev.kind !== 'road' || cur.kind !== 'road') throw new Error('expected road parts')
      expect(cur.line[0]).toEqual(prev.line[prev.line.length - 1])
    }
    const last = parts[2]!.geometry
    expect(last.kind === 'road' && last.line[last.line.length - 1]).toEqual([0, 0.05])
  })
  it('keeps a site as a single part', () => {
    const site = {
      kind: 'site' as const,
      rings: [
        [
          [0, 0],
          [0.01, 0],
          [0.01, 0.01],
          [0, 0],
          [0, 0],
        ] as [number, number][],
      ],
    }
    expect(partsOf(site)).toEqual([{ idx: 0, fromM: 0, toM: 0, geometry: site }])
  })
})
