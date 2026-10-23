import { describe, expect, it } from 'vitest'
import { LOAD_MB } from './cost.ts'
import { SPAN_YEARS } from './season.ts'

describe('the size of a time-lapse load', () => {
  it('is one picture for each of the 6 years, in whole MB: about 13 (2.0 to 2.4 MB a picture, measured at Navi Mumbai)', () => {
    expect(SPAN_YEARS).toBe(6)
    expect(LOAD_MB).toBe(13)
    expect(Number.isInteger(LOAD_MB)).toBe(true)
  })
})
