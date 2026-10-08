import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// No DOM here, so React is stood in for by the least that runs the hook: one state cell, and an effect that runs its
// cleanup and then itself whenever its dependencies change. The timer logic under test is the real one.
const react = vi.hoisted(() => {
  const cell: { value: unknown; deps?: unknown[]; cleanup?: (() => void) | void; set: boolean } = {
    value: undefined,
    set: false,
  }
  return {
    cell,
    useState: (init: unknown) => {
      if (!cell.set) Object.assign(cell, { value: init, set: true })
      return [cell.value, (v: unknown) => (cell.value = v)]
    },
    useEffect: (fn: () => (() => void) | void, deps: unknown[]) => {
      if (cell.deps?.every((d, i) => Object.is(d, deps[i]))) return
      cell.cleanup?.()
      cell.deps = deps
      cell.cleanup = fn()
    },
  }
})
vi.mock('react', () => ({ useState: react.useState, useEffect: react.useEffect }))

import { useRested } from './useRested.ts'

describe('useRested', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.assign(react.cell, { value: undefined, deps: undefined, cleanup: undefined, set: false })
  })
  afterEach(() => vi.useRealTimers())

  it('gives the first value at once', () => {
    expect(useRested('a', 250)).toBe('a')
  })

  it('never surfaces a value that changes again inside the rest', () => {
    const seen = new Set<string>([useRested('a', 250)])
    for (const v of ['b', 'c', 'd', 'e']) {
      vi.advanceTimersByTime(100) // each change comes 100 ms after the last: 400 ms in all, never 250 at rest
      seen.add(useRested(v, 250))
    }
    expect([...seen]).toEqual(['a'])
    vi.advanceTimersByTime(249)
    expect(useRested('e', 250)).toBe('a')
  })

  it('surfaces the value that rests, 250 ms after its last change', () => {
    useRested('a', 250)
    useRested('b', 250)
    vi.advanceTimersByTime(250)
    expect(useRested('b', 250)).toBe('b')
  })

  it('counts the rest from the last change, not from the first', () => {
    useRested('a', 250)
    useRested('b', 250)
    vi.advanceTimersByTime(200)
    useRested('c', 250)
    vi.advanceTimersByTime(200) // 400 ms after b, 200 ms after c
    expect(useRested('c', 250)).toBe('a')
    vi.advanceTimersByTime(50)
    expect(useRested('c', 250)).toBe('c')
  })
})
