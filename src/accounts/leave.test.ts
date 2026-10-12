import { describe, expect, it } from 'vitest'
import { newInvestigation, setServerId, type Investigation } from '../data/investigation.ts'
import type { AoiInput } from '../geo/aoi.ts'
import { memoryStore, type InvestigationStore } from '../data/store.ts'
import { accountIsGone, deleteAccountAndCopies, leave, purgeSaved, savedCopies } from './leave.ts'

const AOI: AoiInput = {
  kind: 'site',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [79.08, 21.14],
        [79.09, 21.14],
        [79.09, 21.15],
        [79.08, 21.14],
      ],
    ],
  },
}
const mk = (n: number, serverId: string | null = null): Investigation => {
  const inv = newInvestigation(
    { name: `Yard ${n}`, aoi: AOI, dateFrom: '2025-01-01', dateTo: '2025-12-31' },
    new Date('2026-10-05T10:00:00Z'),
    `00000000-0000-4000-8000-00000000000${n}`,
  )
  return serverId ? setServerId(inv, serverId) : inv
}
async function stocked(...invs: Investigation[]) {
  const store = memoryStore()
  for (const i of invs) await store.put(i)
  return store
}
const ids = async (store: InvestigationStore) => (await store.list()).map((i) => i.name).sort()

/** The steps a flow took, in order: what the person is promised ("removed before signed out") is read from this. */
function recorder() {
  const log: string[] = []
  return {
    log,
    deps: (store: InvestigationStore, over: Partial<Parameters<typeof leave>[0]> = {}) => ({
      store,
      userId: 'u1',
      signOut: async () => void log.push('signOut'),
      forgetConsent: (u: string) => void log.push(`forget:${u}`),
      ...over,
    }),
  }
}

describe('the copies of this browser that are also on the server', () => {
  it('lists only copies that have a server id: a local-only investigation is never on the list', async () => {
    const store = await stocked(mk(1, 'srv-1'), mk(2), mk(3, 'srv-3'))
    expect((await savedCopies(store)).map((i) => i.name).sort()).toEqual(['Yard 1', 'Yard 3'])
  })

  it('purges those and leaves the local-only ones alone', async () => {
    const store = await stocked(mk(1, 'srv-1'), mk(2), mk(3, 'srv-3'))
    const removed = await purgeSaved(store)
    expect(removed.map((i) => i.name).sort()).toEqual(['Yard 1', 'Yard 3'])
    expect(await ids(store)).toEqual(['Yard 2'])
  })

  it('holds nothing to leak when the store cannot be read', async () => {
    const broken: InvestigationStore = {
      ...memoryStore(),
      list: async () => {
        throw new Error('IDB_BLOCKED')
      },
    }
    expect(await savedCopies(broken)).toEqual([])
  })
})

describe('signing out', () => {
  it("removes the saved copies, forgets this user's agreement, then signs out, in that order", async () => {
    const store = await stocked(mk(1, 'srv-1'), mk(2))
    const r = recorder()
    const removed = await leave(r.deps(store))
    expect(removed.map((i) => i.name)).toEqual(['Yard 1'])
    expect(r.log).toEqual(['forget:u1', 'signOut'])
    expect(await ids(store)).toEqual(['Yard 2'])
  })

  it('keeps the person signed in, and says so by throwing, when a copy cannot be removed', async () => {
    const real = await stocked(mk(1, 'srv-1'))
    const store: InvestigationStore = {
      ...real,
      remove: async () => {
        throw new Error('IDB_BLOCKED')
      },
    }
    const r = recorder()
    await expect(leave(r.deps(store))).rejects.toThrow('IDB_BLOCKED')
    // nothing after the failed step ran: not signed out, the agreement is kept
    expect(r.log).toEqual([])
  })

  it('signs out at once when there is nothing saved here', async () => {
    const r = recorder()
    expect(await leave(r.deps(await stocked(mk(2))))).toEqual([])
    expect(r.log).toEqual(['forget:u1', 'signOut'])
  })
})

describe('deleting the account', () => {
  const gone = { deleteAccount: async () => {}, accountIsGone: async () => false }

  it('asks the server first, and only then removes the copies, forgets the agreement and signs out', async () => {
    const store = await stocked(mk(1, 'srv-1'), mk(2))
    const r = recorder()
    const removed = await deleteAccountAndCopies({
      ...r.deps(store),
      ...gone,
      deleteAccount: async () => void r.log.push('server'),
    })
    expect(removed.map((i) => i.name)).toEqual(['Yard 1'])
    expect(r.log).toEqual(['server', 'forget:u1', 'signOut'])
    expect(await ids(store)).toEqual(['Yard 2'])
  })

  it('treats a lost answer as done when Auth says the user no longer exists', async () => {
    const store = await stocked(mk(1, 'srv-1'), mk(2))
    const r = recorder()
    await deleteAccountAndCopies({
      ...r.deps(store),
      deleteAccount: async () => {
        throw new Error('DELETE_FAILED')
      },
      accountIsGone: async () => true,
    })
    expect(r.log).toEqual(['forget:u1', 'signOut'])
    expect(await ids(store)).toEqual(['Yard 2'])
  })

  it('fails, touching nothing local, when the account is still there', async () => {
    const store = await stocked(mk(1, 'srv-1'))
    const r = recorder()
    await expect(
      deleteAccountAndCopies({
        ...r.deps(store),
        deleteAccount: async () => {
          throw new Error('DELETE_FAILED')
        },
        accountIsGone: async () => false,
      }),
    ).rejects.toThrow('DELETE_FAILED')
    expect(r.log).toEqual([])
    expect(await ids(store)).toEqual(['Yard 1'])
  })
})

describe('is the account gone', () => {
  const asked = (error: { status?: number; code?: string; name?: string } | null) =>
    accountIsGone(async () => ({ error }))

  it('is yes when Auth refuses the token (401, 403) or says the user does not exist', async () => {
    expect(await asked({ status: 401 })).toBe(true)
    expect(await asked({ status: 403 })).toBe(true)
    expect(await asked({ status: 400, code: 'user_not_found' })).toBe(true)
    // auth-js drops a session the server no longer knows and says so by name
    expect(await asked({ status: 400, name: 'AuthSessionMissingError' })).toBe(true)
  })

  it('is no for a user that answers, a server that fails and a connection that does not get through', async () => {
    expect(await asked(null)).toBe(false)
    expect(await asked({ status: 500 })).toBe(false)
    expect(await asked({ status: 429 })).toBe(false)
    expect(await asked({})).toBe(false) // no status: a fetch that never reached Auth
    expect(await asked({ status: 400, code: 'refresh_token_not_found' })).toBe(false)
  })

  it('is no when the question itself cannot be asked', async () => {
    expect(
      await accountIsGone(async () => {
        throw new TypeError('Failed to fetch')
      }),
    ).toBe(false)
  })
})
