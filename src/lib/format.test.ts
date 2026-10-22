import { describe, expect, it } from 'vitest'
import { fmtDate } from './format.ts'

describe('fmtDate', () => {
  it.each([
    ['2025-12-20', '20 Dec 2025'],
    ['2024-02-29', '29 Feb 2024'],
    ['2017-01-01', '1 Jan 2017'],
  ])('writes the real day %s as %s', (ymd, shown) => {
    expect(fmtDate(ymd)).toBe(shown)
  })

  // A date that is not a real day is shown as it was written, so it is never mistaken for another day, and nothing throws (a throw
  // here blanked the workbench and the report for good).
  it.each([
    '2025-12-30junk', // read as "12 Jun 2025" before
    '2025-02-30', // read as "2 Mar 2025" before
    '2025-13-01', // threw before
    '2025-13-45', // threw before
    'zzzz', // threw before
    '', // threw before
  ])('shows %j as written, never as another day, and does not throw', (bad) => {
    expect(fmtDate(bad)).toBe(bad)
  })
})
