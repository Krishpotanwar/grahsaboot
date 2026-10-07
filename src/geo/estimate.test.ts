import { describe, expect, it } from 'vitest'
import { estimateFirstView } from './estimate.ts'
import type { AoiSummary } from './aoi.ts'

const site = { kind: 'site' } as AoiSummary
const road = { kind: 'road' } as AoiSummary

describe('estimateFirstView', () => {
  it('estimates passes and megabytes from measured per-date sizes', () => {
    expect(estimateFirstView(site, '2025-01-01', '2026-01-01')).toEqual({ dates: 75, mb: 18 })
    expect(estimateFirstView(road, '2024-01-01', '2026-01-01')).toEqual({ dates: 150, mb: 33 })
  })
  it('never returns zero passes', () => {
    expect(estimateFirstView(site, '2025-01-01', '2025-01-02').dates).toBe(1)
  })
})
