import { describe, expect, it } from 'vitest'
import { clearConsent, CONSENT_VERSION, consentKey, giveConsent, hasConsent } from './consent.ts'

// A storage that logs what it is asked, so the order of the server call and the local key can be read back.
function storage(log: string[] = [], over: Partial<Storage> = {}) {
  const m = new Map<string, string>()
  const s = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      log.push(`local:${k}`)
      m.set(k, v)
    },
    removeItem: (k: string) => void m.delete(k),
    ...over,
  }
  return Object.assign(s, { size: () => m.size })
}

describe('consent', () => {
  it('is kept per user: the key carries the user id, and one user agreeing says nothing for another', async () => {
    const s = storage()
    expect(consentKey('u1')).toBe('gs-consent:u1')
    expect(hasConsent('u1', s)).toBe(false)
    await giveConsent('u1', async () => {}, s)
    expect(hasConsent('u1', s)).toBe(true)
    // counter-case: the next person to sign in on this browser is asked
    expect(hasConsent('u2', s)).toBe(false)
  })

  it('knows only the current version of the notice', () => {
    const s = storage()
    s.setItem(consentKey('u1'), 'v0')
    expect(hasConsent('u1', s)).toBe(false)
    s.setItem(consentKey('u1'), CONSENT_VERSION)
    expect(hasConsent('u1', s)).toBe(true)
  })

  it('records the agreement on the server first, and writes the local key only after that succeeded (E9)', async () => {
    const log: string[] = []
    await giveConsent('u1', async (v) => void log.push(`server:${v}`), storage(log))
    expect(log).toEqual([`server:${CONSENT_VERSION}`, 'local:gs-consent:u1'])
  })

  it('writes no local key, and says so, when the server did not record it', async () => {
    const s = storage()
    await expect(
      giveConsent(
        'u1',
        async () => {
          throw new Error('RPC_FAILED')
        },
        s,
      ),
    ).rejects.toThrow('RPC_FAILED')
    expect(s.size()).toBe(0)
    expect(hasConsent('u1', s)).toBe(false)
  })

  it('does not turn an agreement the server holds into a failure when this browser cannot store it', async () => {
    const blocked = storage([], {
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    await expect(giveConsent('u1', async () => {}, blocked)).resolves.toBeUndefined()
    // and a storage that cannot be read is "not agreed": the person is asked again, never skipped
    const unreadable = storage([], {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    expect(hasConsent('u1', unreadable)).toBe(false)
  })

  it("forgets one user's agreement when they leave, and only theirs", async () => {
    const s = storage()
    await giveConsent('u1', async () => {}, s)
    await giveConsent('u2', async () => {}, s)
    clearConsent('u1', s)
    expect(hasConsent('u1', s)).toBe(false)
    // counter-case: another user's agreement on this browser is not touched
    expect(hasConsent('u2', s)).toBe(true)
  })

  it('does not fail a sign-out because this browser cannot write its storage', () => {
    const blocked = storage([], {
      removeItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    expect(() => clearConsent('u1', blocked)).not.toThrow()
  })
})
