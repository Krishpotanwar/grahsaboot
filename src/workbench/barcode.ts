import type { QualityLabel } from '../evidence/types.ts'
import type { EntryStatus } from './runner.ts'

// The marks of the barcode are by date, the native slider under it is by pass: a pass is the unit of the slider and of the
// keyboard, a date (a place along a year or along the whole range) is the unit of the picture.

const DAY = 86_400_000
const utc = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10))

/** A year's tick area: 16 px of ticks over a 1 px rule. */
export const ROW_H = 17
/** The gap between two years' rows. */
export const ROW_GAP = 5
/** The year labels under a road's strip. */
export const YEARS_H = 18

export interface YearRow {
  year: number
  /** 365 or 366: the ticks are spread over all of them, so a partial year has empty stretches. */
  days: number
  /** `i` indexes the `dates` given; `f` is the tick's place along the year, 0 = 1 January. */
  ticks: Array<{ i: number; f: number }>
}

/** One row per calendar year that [from, to] touches, holding that year's passes. Dates outside [from, to] are left out. */
export function yearRows(dates: string[], from: string, to: string): YearRow[] {
  const first = Number(from.slice(0, 4))
  const rows: YearRow[] = []
  for (let year = first; year <= Number(to.slice(0, 4)); year++)
    rows.push({ year, days: (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY, ticks: [] })
  dates.forEach((d, i) => {
    if (d < from || d > to) return
    const row = rows[Number(d.slice(0, 4)) - first]
    if (row) row.ticks.push({ i, f: (utc(d) - Date.UTC(row.year, 0, 1)) / DAY / row.days })
  })
  return rows
}

/** The January labels under a road's strip, `f` being their place along [from, to] (0..1). */
export function stripYears(from: string, to: string): Array<{ year: number; f: number }> {
  const t0 = utc(from)
  const span = utc(to) - t0
  const out: Array<{ year: number; f: number }> = []
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++)
    out.push({ year, f: span > 0 ? (Date.UTC(year, 0, 1) - t0) / span : 0 })
  // A range that starts after its first January still starts with that year's label, unless the next January is close.
  if (out[0] && out[0].f < 0) {
    if (out[1] && out[1].f < 0.08) out.shift()
    else out[0].f = 0
  }
  return out.filter((y) => y.f <= 0.92) // a label needs room to its right
}

/** How clearly a pass sees the outline, as the mark that says so. A failed check is read like a pass that is not covered. */
export type TickKind = 'clear' | 'partial' | 'obscured' | 'unchecked'
export const tickKind = (label: QualityLabel | null | undefined, status: EntryStatus): TickKind =>
  label === 'CLEAR'
    ? 'clear'
    : label === 'PARTIAL'
      ? 'partial'
      : label || status === 'error'
        ? 'obscured'
        : 'unchecked'
/** Tick heights in px: the kinds are told apart by height first, so no colour is needed to read them. */
export const TICK_PX: Record<TickKind, number> = { clear: 16, partial: 8, obscured: 3, unchecked: 2 }

/**
 * The index of the pass nearest in date to `t` (ms since the epoch), or -1 with no passes. `dates` are sorted ISO dates.
 * Midway between two passes it is the earlier one.
 */
export function nearestPass(dates: string[], t: number): number {
  if (dates.length === 0) return -1
  let lo = 0
  let hi = dates.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (Date.parse(dates[mid]!) < t) lo = mid + 1
    else hi = mid
  }
  // `lo` is the first pass at or after `t` (the last one when all are before it)
  return lo > 0 && t - Date.parse(dates[lo - 1]!) <= Date.parse(dates[lo]!) - t ? lo - 1 : lo
}

/** The date (ms) at fraction `f` along a site's year row, or along a road's strip when `row` is null: the inverse of a tick's place. */
export const dateAt = (f: number, row: { year: number; days: number } | null, t0: number, span: number) =>
  row ? Date.UTC(row.year, 0, 1) + f * row.days * DAY : t0 + f * span

/** The dates the list shows: the pinned ones and the date on show, once each, oldest first. */
export const listDates = (pinned: string[], current: string | null): string[] =>
  [...new Set(current ? [...pinned, current] : pinned)].sort()

/** The height of the barcode itself (without its legend): a row per year for a site, one strip and its year labels for a road. */
export const barcodeHeight = (road: boolean, years: number) =>
  road ? ROW_H + YEARS_H : years * ROW_H + Math.max(0, years - 1) * ROW_GAP
