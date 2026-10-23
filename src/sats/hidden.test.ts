import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSatsHidden, SATS_HIDDEN_KEY, writeSatsHidden } from './hidden.ts'

describe('the remembered hide of the satellites', () => {
  afterEach(() => vi.unstubAllGlobals())
  const store = (initial: Record<string, string> = {}) => {
    const data = { ...initial }
    return {
      data,
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => void (data[k] = v),
      removeItem: (k: string) => void delete data[k],
    }
  }

  it('shows the satellites unless the person hid them', () => {
    vi.stubGlobal('localStorage', store())
    expect(readSatsHidden()).toBe(false)
    vi.stubGlobal('localStorage', store({ [SATS_HIDDEN_KEY]: '1' }))
    expect(readSatsHidden()).toBe(true)
    for (const junk of ['', '0', 'true', 'yes', 'hidden']) {
      vi.stubGlobal('localStorage', store({ [SATS_HIDDEN_KEY]: junk }))
      expect(readSatsHidden(), junk).toBe(false)
    }
  })

  it('is kept under gs-sats-hidden, and showing again leaves nothing behind', () => {
    const s = store()
    vi.stubGlobal('localStorage', s)
    writeSatsHidden(true)
    expect(s.data).toEqual({ 'gs-sats-hidden': '1' })
    expect(readSatsHidden()).toBe(true)
    writeSatsHidden(false)
    expect(s.data).toEqual({})
    expect(readSatsHidden()).toBe(false)
  })

  it('is never required: storage that throws or is missing changes nothing', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked })
    expect(readSatsHidden()).toBe(false)
    expect(() => writeSatsHidden(true)).not.toThrow()
    expect(() => writeSatsHidden(false)).not.toThrow()
    vi.unstubAllGlobals() // no localStorage at all (node): reading it is a ReferenceError
    expect(readSatsHidden()).toBe(false)
    expect(() => writeSatsHidden(true)).not.toThrow()
  })
})
