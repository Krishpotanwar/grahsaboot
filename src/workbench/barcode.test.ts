import { describe, expect, it } from 'vitest'
import {
  ROW_GAP,
  ROW_H,
  TICK_PX,
  YEARS_H,
  barcodeHeight,
  dateAt,
  listDates,
  nearestPass,
  stripYears,
  tickKind,
  yearRows,
} from './barcode.ts'

describe('yearRows', () => {
  it('has a row for every calendar year the range touches, and each tick by day of the year', () => {
    const dates = ['2018-01-01', '2018-07-02', '2019-12-31', '2020-02-15']
    const rows = yearRows(dates, '2018-01-01', '2020-06-30')
    expect(rows.map((r) => [r.year, r.days])).toEqual([
      [2018, 365],
      [2019, 365],
      [2020, 366],
    ])
    expect(rows[0]!.ticks).toEqual([
      { i: 0, f: 0 },
      { i: 1, f: 182 / 365 }, // 2 July is day 182 (0-based) of a common year
    ])
    expect(rows[1]!.ticks).toEqual([{ i: 2, f: 364 / 365 }]) // the last day sits at the far end, inside the row
    expect(rows[2]!.ticks).toEqual([{ i: 3, f: 45 / 366 }])
  })

  it('spreads a leap year over its 366 days', () => {
    const [row] = yearRows(['2024-03-01', '2024-12-31'], '2024-01-01', '2024-12-31')
    expect(row!.days).toBe(366)
    expect(row!.ticks).toEqual([
      { i: 0, f: 60 / 366 }, // 31 + 29 days before 1 March
      { i: 1, f: 365 / 366 },
    ])
  })

  it('drops dates outside the range, and keeps the index of those it keeps', () => {
    const rows = yearRows(
      ['2017-12-31', '2018-03-01', '2018-12-31', '2019-01-01'],
      '2018-01-01',
      '2018-12-31',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.ticks.map((t) => t.i)).toEqual([1, 2])
  })

  it('drops a date of the same year that lies outside the range', () => {
    const rows = yearRows(['2025-03-05', '2025-06-15', '2025-07-10'], '2025-06-01', '2025-06-30')
    expect(rows[0]!.ticks.map((t) => t.i)).toEqual([1])
  })

  it('shows a range inside one year as one row, the rest of the year empty', () => {
    const rows = yearRows(['2025-06-15'], '2025-06-01', '2025-06-30')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.days).toBe(365)
    expect(rows[0]!.ticks).toEqual([{ i: 0, f: 165 / 365 }])
    expect(yearRows([], '2025-06-01', '2025-06-30')[0]!.ticks).toEqual([]) // the row is still there
  })
})

describe('stripYears', () => {
  it('puts a label at each January of the range', () => {
    const y = stripYears('2018-01-01', '2025-12-31')
    expect(y.map((l) => l.year)).toEqual([2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025])
    expect(y[0]!.f).toBe(0)
    expect(y[7]!.f).toBeCloseTo(
      (Date.UTC(2025, 0, 1) - Date.UTC(2018, 0, 1)) / (Date.UTC(2025, 11, 31) - Date.UTC(2018, 0, 1)),
    )
  })

  it('starts a range that begins after its January with that year at the left edge', () => {
    expect(stripYears('2025-06-01', '2025-12-31')).toEqual([{ year: 2025, f: 0 }])
    expect(stripYears('2018-06-01', '2020-12-31').map((l) => [l.year, l.f === 0])).toEqual([
      [2018, true],
      [2019, false],
      [2020, false],
    ])
  })

  it('leaves out a first label that the next January would sit on, and a label with no room', () => {
    // 1 Nov 2018: the January after it is 2 months in, 7% of the strip
    expect(stripYears('2018-11-01', '2020-12-31').map((l) => l.year)).toEqual([2019, 2020])
    // a range ending in mid-January: 2025 would start 4% from the right end
    expect(stripYears('2024-01-01', '2025-01-15').map((l) => l.year)).toEqual([2024])
  })
})

describe('tickKind and TICK_PX', () => {
  it('reads the height from the quality label', () => {
    const px = (l: Parameters<typeof tickKind>[0], s: Parameters<typeof tickKind>[1] = 'checked') =>
      TICK_PX[tickKind(l, s)]
    expect(px('CLEAR')).toBe(16)
    expect(px('PARTIAL')).toBe(8)
    expect(px('OBSCURED')).toBe(3)
    expect(px('NOT_COVERED')).toBe(3)
  })

  it('shows a pass not checked yet as the faintest, and a failed check like one that is not covered', () => {
    expect(TICK_PX[tickKind(null, 'queued')]).toBe(2)
    expect(TICK_PX[tickKind(null, 'checking')]).toBe(2)
    expect(TICK_PX[tickKind(null, 'error')]).toBe(3)
    expect(tickKind(null, 'error')).toBe(tickKind('NOT_COVERED', 'checked'))
    expect(tickKind(undefined, 'queued')).toBe('unchecked')
  })
})

describe('nearestPass', () => {
  const at = (ymd: string) => Date.parse(ymd)
  const dates = ['2025-01-10', '2025-03-05', '2025-06-15', '2025-12-20']

  it('returns the pass nearest in date', () => {
    expect(nearestPass(dates, at('2025-01-12'))).toBe(0)
    expect(nearestPass(dates, at('2025-02-20'))).toBe(1)
    expect(nearestPass(dates, at('2025-04-10'))).toBe(1)
    expect(nearestPass(dates, at('2025-05-20'))).toBe(2)
    expect(nearestPass(dates, at('2025-12-19'))).toBe(3)
  })

  it('takes the first and the last pass for a time before or after them all', () => {
    expect(nearestPass(dates, at('2017-01-01'))).toBe(0)
    expect(nearestPass(dates, at('2030-01-01'))).toBe(3)
  })

  it('lands exactly on a pass', () => {
    dates.forEach((d, i) => expect(nearestPass(dates, at(d))).toBe(i))
  })

  it('goes to the earlier pass midway between two', () => {
    expect(nearestPass(['2025-01-01', '2025-01-11'], at('2025-01-06'))).toBe(0)
    expect(nearestPass(['2025-01-01', '2025-01-11'], at('2025-01-06') + 1)).toBe(1)
  })

  it('handles one pass and none', () => {
    expect(nearestPass(['2025-01-01'], at('2030-01-01'))).toBe(0)
    expect(nearestPass(['2025-01-01'], at('2001-01-01'))).toBe(0)
    expect(nearestPass([], at('2025-01-01'))).toBe(-1)
  })

  it('finds the pass among 1,100 in a few probes', () => {
    const many = Array.from({ length: 1100 }, (_, i) =>
      new Date(Date.UTC(2018, 0, 1) + i * 2 * 86_400_000).toISOString().slice(0, 10),
    )
    for (const i of [0, 1, 549, 550, 1098, 1099]) expect(nearestPass(many, at(many[i]!) + 3_600_000)).toBe(i)
  })
})

describe('listDates', () => {
  it('lists the pinned dates and the date on show, sorted', () => {
    expect(listDates(['2025-12-20', '2025-01-10'], '2025-03-05')).toEqual([
      '2025-01-10',
      '2025-03-05',
      '2025-12-20',
    ])
  })

  it('lists a date once when the date on show is already pinned', () => {
    expect(listDates(['2025-01-10', '2025-12-20'], '2025-12-20')).toEqual(['2025-01-10', '2025-12-20'])
  })

  it('has only the pinned dates, or only the date on show, when there is no other', () => {
    expect(listDates(['2025-01-10'], null)).toEqual(['2025-01-10'])
    expect(listDates([], '2025-03-05')).toEqual(['2025-03-05'])
    expect(listDates([], null)).toEqual([])
  })
})

describe('barcodeHeight', () => {
  it('is a row per year with a gap between, or the strip and its labels', () => {
    expect(barcodeHeight(false, 1)).toBe(ROW_H)
    expect(barcodeHeight(false, 8)).toBe(8 * ROW_H + 7 * ROW_GAP)
    expect(barcodeHeight(true, 8)).toBe(ROW_H + YEARS_H)
  })
})

describe('dateAt', () => {
  it('is the inverse of a tick place: every tick maps back to its own pass (leap years and mid-year ranges included)', () => {
    for (const [from, to] of [
      ['2024-03-10', '2025-09-01'],
      ['2023-01-01', '2024-12-31'],
    ] as const) {
      const dates = ['2024-02-29', '2024-07-01', '2024-12-31', '2025-01-01', '2025-08-31'].filter(
        (d) => d >= from && d <= to,
      )
      for (const row of yearRows(dates, from, to))
        for (const t of row.ticks) expect(nearestPass(dates, dateAt(t.f, row, 0, 1))).toBe(t.i)
    }
  })

  it('a road maps its strip onto the whole range', () => {
    const t0 = Date.parse('2025-01-01')
    const span = Date.parse('2025-12-31') - t0
    expect(dateAt(0, null, t0, span)).toBe(t0)
    expect(dateAt(1, null, t0, span)).toBe(Date.parse('2025-12-31'))
  })
})
