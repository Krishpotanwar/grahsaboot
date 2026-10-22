import { describe, expect, it } from 'vitest'
import { chooseTier, downgrade, isSlowLink, type TierSignals } from './tier.ts'

const base: TierSignals = {
  webgl2: true,
  renderer: 'ANGLE (NVIDIA)',
  saveData: false,
  effectiveType: '4g',
  deviceMemory: 8,
  cores: 8,
}

describe('chooseTier', () => {
  it.each([
    [{}, 3],
    [{ webgl2: false }, 0],
    [{ renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))' }, 0],
    [{ renderer: 'llvmpipe (LLVM 17.0.6, 256 bits)' }, 0],
    [{ saveData: true }, 1],
    [{ effectiveType: '3g' }, 1],
    [{ deviceMemory: 2 }, 1],
    [{ cores: 4 }, 2],
    [{ deviceMemory: 3 }, 2],
    [{ deviceMemory: null, cores: null }, 3],
  ] as const)('%j → T%s', (over, tier) => {
    expect(chooseTier({ ...base, ...over })).toBe(tier)
  })
  it('only ever downgrades by one', () => {
    expect([3, 2, 1, 0].map((t) => downgrade(t as 0 | 1 | 2 | 3))).toEqual([2, 1, 0, 0])
  })
})

// The time-lapse loader loads one year at a time on a slow link (review answer D15): the browser's own word for it, no new guess.
describe('isSlowLink', () => {
  it.each([
    [{ saveData: true }, true],
    [{ effectiveType: 'slow-2g' }, true],
    [{ effectiveType: '2g' }, true],
    [{ effectiveType: '3g' }, true],
    [{ saveData: true, effectiveType: '4g' }, true],
    [{ saveData: false, effectiveType: '3g' }, true],
    [{ effectiveType: '4g' }, false],
    [{ effectiveType: null }, false], // Firefox and Safari send no such signal: they take the three-at-once path
    [{ effectiveType: '' }, false],
    [{ effectiveType: '5g' }, false],
    [{ effectiveType: 'xslow-2g' }, false], // the whole word, not a part of it
    [{ effectiveType: '3gx' }, false],
    [{}, false],
  ] as const)('%j → %s', (over, slow) => {
    expect(isSlowLink({ ...base, ...over })).toBe(slow)
  })

  it('reads the connection only: a weak phone or a missing WebGL2 is not a slow link', () => {
    for (const weak of [{ webgl2: false }, { deviceMemory: 1 }, { cores: 2 }, { renderer: 'llvmpipe' }])
      expect(isSlowLink({ ...base, ...weak })).toBe(false)
  })

  it('needs no more than the two connection signals', () => {
    expect(isSlowLink({ saveData: false, effectiveType: '3g' })).toBe(true)
    expect(isSlowLink({ saveData: false, effectiveType: null })).toBe(false)
  })

  it('says what chooseTier says about the link: the same two signals make a tier 1 on a strong phone', () => {
    for (const saveData of [false, true])
      for (const effectiveType of [null, 'slow-2g', '2g', '3g', '4g']) {
        const s = { ...base, saveData, effectiveType }
        expect(chooseTier(s) === 1).toBe(isSlowLink(s))
      }
  })
})
