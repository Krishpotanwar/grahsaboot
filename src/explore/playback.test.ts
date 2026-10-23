import { describe, expect, it } from 'vitest'
import { canPlay, keyAction, MIN_PLAY, PACE_MS, stepIndex } from './playback.ts'

describe('the pace of the loop', () => {
  it('never changes a frame faster than every 700 ms (WCAG 2.3.1 and 2.2.2), and is about 1.2 s', () => {
    expect(PACE_MS).toBeGreaterThanOrEqual(700)
    expect(PACE_MS).toBe(1200)
  })
})

describe('when the loop can play', () => {
  it('needs 3 frames, and is never offered to a person who asked for less motion', () => {
    expect(MIN_PLAY).toBe(3)
    expect(canPlay(2, false)).toBe(false)
    expect(canPlay(3, false)).toBe(true)
    expect(canPlay(6, false)).toBe(true)
    expect(canPlay(6, true)).toBe(false)
    expect(canPlay(0, false)).toBe(false)
  })
})

describe('stepping through frames', () => {
  it('goes to the next and the previous frame and wraps round at both ends', () => {
    expect(stepIndex(0, 5, 'next')).toBe(1)
    expect(stepIndex(4, 5, 'next')).toBe(0)
    expect(stepIndex(3, 5, 'prev')).toBe(2)
    expect(stepIndex(0, 5, 'prev')).toBe(4)
  })

  it('jumps to the first and the last frame', () => {
    expect(stepIndex(3, 5, 'first')).toBe(0)
    expect(stepIndex(1, 5, 'last')).toBe(4)
  })

  it('stays at 0 for a list of one, and for no list at all', () => {
    expect(stepIndex(0, 1, 'next')).toBe(0)
    expect(stepIndex(0, 1, 'prev')).toBe(0)
    expect(stepIndex(0, 0, 'next')).toBe(0)
    expect(stepIndex(0, 0, 'last')).toBe(0)
  })
})

describe('the keys of the picture', () => {
  it('maps Space to play and pause, the arrows to a step, Home and End to the ends', () => {
    expect(keyAction(' ')).toBe('toggle')
    expect(keyAction('ArrowRight')).toBe('next')
    expect(keyAction('ArrowDown')).toBe('next')
    expect(keyAction('ArrowLeft')).toBe('prev')
    expect(keyAction('ArrowUp')).toBe('prev')
    expect(keyAction('Home')).toBe('first')
    expect(keyAction('End')).toBe('last')
  })

  it('leaves every other key alone, so Tab, Enter and the browser shortcuts keep working', () => {
    for (const k of ['Tab', 'Enter', 'Escape', 'a', 'PageDown', 'constructor', '__proto__', ''])
      expect(keyAction(k)).toBeNull()
  })
})
