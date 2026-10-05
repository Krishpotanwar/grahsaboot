import { describe, expect, it } from 'vitest'

describe('runtime prerequisites', () => {
  it('has WebCrypto SHA-256 (frame-v1 hashing depends on it)', async () => {
    const d = await crypto.subtle.digest('SHA-256', new Uint8Array([1, 2, 3]))
    expect(new Uint8Array(d).length).toBe(32)
  })
  it('has structuredClone and AbortSignal.timeout (workers and fetch use them)', () => {
    expect(typeof structuredClone).toBe('function')
    expect(typeof AbortSignal.timeout).toBe('function')
  })
})
