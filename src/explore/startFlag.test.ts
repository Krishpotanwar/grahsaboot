import { afterEach, describe, expect, it } from 'vitest'
import { armStart, isArmed, spendStart } from './startFlag.ts'

afterEach(spendStart)

describe('the in-app start flag', () => {
  it('is not set until the home screen sets it: a link, a reload or a new tab starts nothing', () => {
    expect(isArmed('18.991350,73.065750')).toBe(false)
  })

  it('is set for the one place the home screen button was pressed for, and for no other', () => {
    armStart('18.991350,73.065750')
    expect(isArmed('18.991350,73.065750')).toBe(true)
    expect(isArmed('21.145800,79.088200')).toBe(false)
  })

  it('can be read again until the load has started, because a screen may be drawn twice', () => {
    armStart('18.991350,73.065750')
    expect(isArmed('18.991350,73.065750')).toBe(true)
    expect(isArmed('18.991350,73.065750')).toBe(true)
  })

  it('is spent once the load has started: going back to the page later waits for a tap', () => {
    armStart('18.991350,73.065750')
    spendStart()
    expect(isArmed('18.991350,73.065750')).toBe(false)
  })

  it('goes to the latest place when the button is pressed twice', () => {
    armStart('1.000000,2.000000')
    armStart('3.000000,4.000000')
    expect(isArmed('1.000000,2.000000')).toBe(false)
    expect(isArmed('3.000000,4.000000')).toBe(true)
  })
})
