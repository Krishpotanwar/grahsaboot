import { describe, expect, it } from 'vitest'
import { canPickDefaults, pickDefaults } from './defaults.ts'
import type { DateEntry } from './runner.ts'

const e = (
  date: string,
  label: 'CLEAR' | 'PARTIAL' | 'OBSCURED' | 'NOT_COVERED' | null,
  valid = 1,
  status: DateEntry['status'] = 'checked',
): DateEntry => ({
  date,
  status,
  error: null,
  thumb: null,
  full: null,
  invalid: null,
  thumbFailed: false,
  candidate: {} as never,
  quality: label ? ({ stats: { label, clearFraction: valid } } as never) : null,
})

describe('pickDefaults', () => {
  it('takes the clearest pass in each outer quartile', () => {
    const entries = [
      e('2025-01-10', 'CLEAR', 1),
      e('2025-03-05', 'PARTIAL', 0.5),
      e('2025-06-15', 'OBSCURED', 0),
      e('2025-12-20', 'CLEAR', 1),
    ]
    expect(pickDefaults(entries, '2025-01-01', '2025-12-31')).toEqual({
      before: '2025-01-10',
      after: '2025-12-20',
    })
  })
  it('falls back to the earliest and latest usable passes', () => {
    const entries = [e('2025-05-01', 'PARTIAL', 0.6), e('2025-07-01', 'CLEAR', 1)]
    expect(pickDefaults(entries, '2025-01-01', '2025-12-31')).toEqual({
      before: '2025-05-01',
      after: '2025-07-01',
    })
  })
  it('returns nothing when fewer than two passes are usable', () => {
    expect(
      pickDefaults([e('2025-05-01', 'CLEAR'), e('2025-06-01', 'OBSCURED', 0)], '2025-01-01', '2025-12-31'),
    ).toEqual({ before: null, after: null })
  })
})

describe('canPickDefaults', () => {
  const FROM = '2025-01-01'
  const TO = '2025-12-31' // the outer quartiles are up to 2 Apr and from 1 Oct
  it('is ready once each end has a checked CLEAR photo, however much is still unchecked', () => {
    const entries = [
      e('2025-01-10', 'CLEAR'),
      e('2025-03-01', null, 0, 'checking'),
      e('2025-06-15', null, 0, 'queued'),
      e('2025-11-05', null, 0, 'checking'),
      e('2025-12-20', null, 0, 'queued'),
    ]
    expect(canPickDefaults(entries, FROM, TO)).toBe(false) // the late end has nothing yet
    entries[3] = e('2025-11-05', 'CLEAR')
    expect(canPickDefaults(entries, FROM, TO)).toBe(true)
    expect(pickDefaults(entries, FROM, TO)).toEqual({ before: '2025-01-10', after: '2025-11-05' })
  })
  it('does not settle for a PARTIAL photo while dates at that end are still unchecked', () => {
    const entries = [
      e('2025-01-10', 'PARTIAL', 0.5),
      e('2025-02-01', null, 0, 'queued'),
      e('2025-12-20', 'CLEAR'),
    ]
    expect(canPickDefaults(entries, FROM, TO)).toBe(false)
    entries[1] = e('2025-02-01', 'CLEAR') // a clear one turned up
    expect(canPickDefaults(entries, FROM, TO)).toBe(true)
    expect(pickDefaults(entries, FROM, TO)).toEqual({ before: '2025-02-01', after: '2025-12-20' })
  })
  it('is ready when an end is fully checked with nothing usable: nothing is left to wait for', () => {
    const entries = [
      e('2025-01-10', 'OBSCURED', 0),
      e('2025-02-01', null, 0, 'error'),
      e('2025-06-15', 'CLEAR'),
      e('2025-12-20', 'CLEAR'),
    ]
    expect(canPickDefaults(entries, FROM, TO)).toBe(true)
    expect(pickDefaults(entries, FROM, TO)).toEqual({ before: '2025-06-15', after: '2025-12-20' }) // falls back as before
  })
  it('is not ready with no entries', () => {
    expect(canPickDefaults([], FROM, TO)).toBe(false)
  })
})

describe('pickDefaults ties', () => {
  it('takes the earliest of equally clear early passes and the latest of equally clear late ones', () => {
    const entries = [
      e('2025-02-10', 'CLEAR', 1),
      e('2025-12-20', 'CLEAR', 1),
      e('2025-01-10', 'CLEAR', 1),
      e('2025-11-05', 'CLEAR', 1),
    ]
    expect(pickDefaults(entries, '2025-01-01', '2025-12-31')).toEqual({
      before: '2025-01-10',
      after: '2025-12-20',
    })
  })
})
