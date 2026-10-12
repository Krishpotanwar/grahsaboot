import { describe, expect, it } from 'vitest'
import { trimRing } from './ring.ts'

describe('trimRing', () => {
  const none = new Set<string>()

  it('keeps the last `keep` rested dates and releases the older ones, oldest first', () => {
    let ring: string[] = []
    const released: string[] = []
    for (const d of ['a', 'b', 'c', 'd', 'e']) {
      const r = trimRing(ring, d, 3, none)
      ring = r.ring
      released.push(...r.release)
    }
    expect(ring).toEqual(['c', 'd', 'e'])
    expect(released).toEqual(['a', 'b'])
  })

  it('a date rested on again moves to the end and is not released', () => {
    const r = trimRing(['a', 'b', 'c'], 'a', 3, none)
    expect(r.ring).toEqual(['b', 'c', 'a'])
    expect(r.release).toEqual([])
  })

  it('never takes in or releases the before and after photos and the pinned dates', () => {
    const protect = new Set(['before', 'after', 'pin'])
    const r = trimRing(['x', 'pin'], 'before', 1, protect)
    // `pin` was pinned after it was rested on: it leaves the ring without being released
    expect(r).toEqual({ ring: ['x'], release: [] })
    expect(trimRing(['x'], 'y', 1, protect)).toEqual({ ring: ['y'], release: ['x'] })
  })
})
