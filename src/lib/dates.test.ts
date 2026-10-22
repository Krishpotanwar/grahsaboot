import { describe, expect, it } from 'vitest'
import { plainNumber, realDate } from './dates.ts'

describe('realDate', () => {
  it.each(['2025-12-31', '2017-01-01', '2024-02-29', '2000-02-29', '1999-12-31', '9999-12-31'])(
    '%s is a real day, read as midnight UTC',
    (s) => {
      expect(realDate(s)?.toISOString()).toBe(`${s}T00:00:00.000Z`)
    },
  )

  it.each([
    ['a month that does not exist', '2025-13-01'],
    ['month 00', '2025-00-10'],
    ['day 00', '2025-01-00'],
    ['30 February', '2025-02-30'],
    ['29 February of a year with no leap day', '2025-02-29'],
    ['29 February 1900 (a century year that is not a leap year)', '1900-02-29'],
    ['31 April', '2025-04-31'],
    ['a day, month and year all out of range', '2025-13-45'],
    ['text after the day', '2025-12-30junk'],
    ['text before the day', 'junk2025-12-30'],
    ['a trailing space', '2025-12-30 '],
    ['a leading space', ' 2025-12-30'],
    ['a trailing newline', '2025-12-30\n'],
    ['a time of day', '2025-12-30T00:00:00Z'],
    ['one-digit parts', '2025-1-1'],
    ['no dashes', '20251230'],
    ['slashes', '2025/12/30'],
    ['Arabic-Indic digits', '٢٠٢٥-١٢-٣٠'],
    ['full-width digits', '２０２５-12-30'],
    ['words', 'zzzz'],
    ['nothing', ''],
  ])('refuses %s (%j)', (_why, s) => {
    expect(realDate(s)).toBeUndefined()
  })

  it('refuses a missing value, as a query string gives one', () => {
    expect(realDate(null)).toBeUndefined()
    expect(realDate(undefined)).toBeUndefined()
    expect(realDate(new URLSearchParams('before=').get('after'))).toBeUndefined()
  })

  it('gives a new Date each time, so a caller cannot change what the next one reads', () => {
    const first = realDate('2025-12-31')!
    first.setUTCFullYear(1999)
    expect(realDate('2025-12-31')?.toISOString()).toBe('2025-12-31T00:00:00.000Z')
  })
})

describe('plainNumber', () => {
  it.each([
    ['0', 0],
    ['2000', 2000],
    ['500', 500],
    ['007', 7],
    ['21.1458', 21.1458],
    ['79.0882', 79.0882],
    ['-33.9', -33.9],
    ['-0.5', -0.5],
  ])('reads %j as %d', (s, n) => {
    expect(plainNumber(s)).toBe(n)
  })

  it.each([
    ['hex', '0x7d0'],
    ['an exponent', '1e3'],
    ['a capital exponent', '1E3'],
    ['a leading space', ' 2000'],
    ['a trailing space', '2000 '],
    ['only a space', ' '],
    ['a plus sign', '+5'],
    ['no digit before the point', '.5'],
    ['no digit after the point', '5.'],
    ['two minus signs', '--5'],
    ['a minus after the digits', '5-'],
    ['a comma', '1,5'],
    ['an underscore', '1_000'],
    ['Infinity', 'Infinity'],
    ['NaN', 'NaN'],
    ['Arabic-Indic digits', '٣'],
    ['full-width digits', '１２３'],
    ['a second point', '1.2.3'],
    ['nothing', ''],
    ['digits too many to be a number', '1'.repeat(400)],
  ])('refuses %s (%j)', (_why, s) => {
    expect(plainNumber(s)).toBeUndefined()
  })

  it('refuses a missing value, as a query string gives one', () => {
    expect(plainNumber(null)).toBeUndefined()
    expect(plainNumber(undefined)).toBeUndefined()
  })
})
