import type { AoiSummary } from './aoi.ts'

/**
 * Per-date sizes measured in R3 (docs/geoverify/research/2026-10-05-r3-imagery.md, round 2):
 * SCL ≈ 0.04 MB (site) / 0.06 MB (road); TCI 20 m thumbnail ≈ 0.75 / 1.25 MB; TCI 10 m ≈ 2.8 / 4.7 MB. About 75 passes a year over India.
 */
export function estimateFirstView(
  summary: Pick<AoiSummary, 'kind'>,
  dateFrom: string,
  dateTo: string,
): { dates: number; mb: number } {
  const days = Math.max(1, (Date.parse(dateTo) - Date.parse(dateFrom)) / 86_400_000)
  const dates = Math.max(1, Math.round((days / 365) * 75))
  const road = summary.kind === 'road'
  const [scl, thumb, full] = road ? [0.06, 1.25, 4.7] : [0.04, 0.75, 2.8]
  return { dates, mb: Math.round(dates * scl + Math.min(dates, 12) * thumb + 2 * full) }
}
