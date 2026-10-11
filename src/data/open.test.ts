import { describe, expect, it, vi } from 'vitest'
import { newInvestigation, type Investigation } from './investigation.ts'
import { openInvestigation } from './open.ts'
import { memoryStore, type InvestigationStore } from './store.ts'

const AOI = {
  kind: 'site' as const,
  geometry: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [79.08, 21.14],
        [79.09, 21.14],
        [79.09, 21.15],
        [79.08, 21.14],
      ] as [number, number][],
    ],
  },
}
const SERVER_ID = '11111111-1111-4111-8111-111111111111'
const local = (name = 'Local') =>
  newInvestigation({ name, aoi: AOI, dateFrom: '2025-01-01', dateTo: '2025-12-31' })
const fromServer = (): Investigation => ({ ...local('Server'), id: SERVER_ID, serverId: SERVER_ID })

/** A store whose reads are counted. */
function spied(seed: Investigation[] = []) {
  const store = memoryStore()
  const s: InvestigationStore = {
    get: vi.fn(store.get),
    list: vi.fn(store.list),
    put: vi.fn(store.put),
    remove: vi.fn(store.remove),
  }
  return Promise.all(seed.map((i) => store.put(i))).then(() => s)
}

describe('openInvestigation', () => {
  it('returns this browser copy when the id is stored, and asks nobody else', async () => {
    const inv = local()
    const store = await spied([inv])
    const remote = vi.fn()
    expect(await openInvestigation(inv.id, store, remote)).toEqual(inv)
    expect(remote).not.toHaveBeenCalled()
    expect(store.list).not.toHaveBeenCalled()
  })

  it('is just a store lookup in a dormant build (no remote): a miss is undefined and the list is never read', async () => {
    const store = await spied([local()])
    expect(await openInvestigation(SERVER_ID, store, null)).toBeUndefined()
    expect(store.list).not.toHaveBeenCalled()
    expect(store.put).not.toHaveBeenCalled()
  })

  it('opens the local copy that carries the server id (a saved investigation reached by its server id)', async () => {
    const saved = { ...local('Saved here'), serverId: SERVER_ID }
    const store = await spied([saved, local('Other')])
    const remote = vi.fn()
    expect(await openInvestigation(SERVER_ID, store, remote)).toEqual(saved)
    expect(remote).not.toHaveBeenCalled()
  })

  it('fetches from the server on a full miss and keeps a copy here', async () => {
    const store = await spied([local()])
    const remote = vi.fn().mockResolvedValue(fromServer())
    const got = await openInvestigation(SERVER_ID, store, remote)
    expect(got).toMatchObject({ id: SERVER_ID, name: 'Server' })
    expect(remote).toHaveBeenCalledWith(SERVER_ID)
    expect(await store.get(SERVER_ID)).toMatchObject({ name: 'Server' })
  })

  it('never goes to the server for a local- id, and does not read the list either', async () => {
    const store = await spied()
    const remote = vi.fn()
    expect(
      await openInvestigation('local-00000000-0000-4000-8000-000000000009', store, remote),
    ).toBeUndefined()
    expect(remote).not.toHaveBeenCalled()
    expect(store.list).not.toHaveBeenCalled()
  })

  it('answers undefined, not an error, when the server has nothing or fails', async () => {
    const store = await spied()
    expect(await openInvestigation(SERVER_ID, store, async () => null)).toBeUndefined()
    expect(
      await openInvestigation(SERVER_ID, store, () => Promise.reject(new Error('NETWORK'))),
    ).toBeUndefined()
    expect(store.put).not.toHaveBeenCalled()
  })

  it('still opens what the server sent when keeping a copy here fails', async () => {
    const store = await spied()
    store.put = vi.fn().mockRejectedValue(new Error('QUOTA'))
    expect(await openInvestigation(SERVER_ID, store, async () => fromServer())).toMatchObject({
      id: SERVER_ID,
    })
  })

  it('lets a failing store read through: the hook shows that as STORE_FAILED, as before', async () => {
    const store = await spied()
    store.get = vi.fn().mockRejectedValue(new Error('IDB'))
    await expect(openInvestigation(SERVER_ID, store, null)).rejects.toThrow('IDB')
  })
})
