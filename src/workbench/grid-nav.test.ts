import { describe, expect, it } from 'vitest'
import { moveFocus, moveFocusByDate } from './grid-nav.ts'

describe('moveFocus', () => {
  it.each([
    ['ArrowRight', { r: 0, c: 0 }, { r: 0, c: 1 }],
    ['ArrowLeft', { r: 0, c: 0 }, { r: 0, c: 0 }],
    ['ArrowDown', { r: 1, c: 2 }, { r: 2, c: 2 }],
    ['ArrowDown', { r: 2, c: 2 }, { r: 2, c: 2 }],
    ['ArrowUp', { r: 1, c: 2 }, { r: 0, c: 2 }],
    ['Home', { r: 1, c: 3 }, { r: 1, c: 0 }],
    ['End', { r: 1, c: 0 }, { r: 1, c: 4 }],
    ['x', { r: 1, c: 1 }, { r: 1, c: 1 }],
  ])('%s from %j → %j', (key, from, to) => {
    expect(moveFocus(from, key, 3, 5)).toEqual(to)
  })
})

describe('moveFocusByDate', () => {
  const dates = ['2025-01-10', '2025-03-05', '2025-12-20']

  it('moves along the dates, and stops at the ends', () => {
    expect(moveFocusByDate({ r: 0, date: dates[0]! }, 'ArrowRight', 2, dates)).toEqual({
      r: 0,
      date: dates[1],
    })
    expect(moveFocusByDate({ r: 1, date: dates[2]! }, 'ArrowRight', 2, dates)).toEqual({
      r: 1,
      date: dates[2],
    })
    expect(moveFocusByDate({ r: 0, date: dates[1]! }, 'End', 2, dates)).toEqual({ r: 0, date: dates[2] })
    expect(moveFocusByDate({ r: 0, date: dates[1]! }, 'ArrowDown', 2, dates)).toEqual({
      r: 1,
      date: dates[1],
    })
  })

  it('follows the date when columns appear before it, never the old column number', () => {
    const grown = ['2024-12-01', ...dates] // a pinned date inserted left of the focused one
    expect(moveFocusByDate({ r: 0, date: dates[1]! }, 'ArrowRight', 2, grown)).toEqual({
      r: 0,
      date: dates[2],
    })
    expect(moveFocusByDate({ r: 0, date: dates[1]! }, 'ArrowLeft', 2, grown)).toEqual({
      r: 0,
      date: dates[0],
    })
  })

  it('starts from the first column when its date is no longer a column, and ignores other keys', () => {
    expect(moveFocusByDate({ r: 0, date: 'gone' }, 'ArrowRight', 2, dates)).toEqual({ r: 0, date: dates[1] })
    const pos = { r: 1, date: dates[1]! }
    expect(moveFocusByDate(pos, 'x', 2, dates)).toBe(pos)
    expect(moveFocusByDate(pos, 'End', 2, [])).toBe(pos)
  })
})
