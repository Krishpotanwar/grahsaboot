import { describe, expect, it } from 'vitest'
import { pickDefaults, quartilesDone } from './defaults.ts'
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

describe('quartilesDone', () => {
  it('waits for both outer quartiles only', () => {
    const entries = [
      e('2025-01-10', 'CLEAR'),
      e('2025-06-15', null, 0, 'queued'),
      e('2025-12-20', null, 0, 'checking'),
    ]
    expect(quartilesDone(entries, '2025-01-01', '2025-12-31')).toBe(false)
    entries[2] = e('2025-12-20', 'CLEAR')
    expect(quartilesDone(entries, '2025-01-01', '2025-12-31')).toBe(true)
  })
})
