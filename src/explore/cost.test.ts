import { describe, expect, it } from 'vitest'
import { LOAD_MB } from './cost.ts'
import { SPAN_YEARS } from './season.ts'

describe('the size of a time-lapse load', () => {
  it('is one picture and its search for each of the 6 years, in whole MB: about 14 (14.1 MB on the wire, measured at Navi Mumbai)', () => {
    expect(SPAN_YEARS).toBe(6)
    expect(LOAD_MB).toBe(14)
    expect(Number.isInteger(LOAD_MB)).toBe(true)
  })
})
