import { describe, expect, it } from 'vitest'
import { chooseTier, downgrade, type TierSignals } from './tier.ts'

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
