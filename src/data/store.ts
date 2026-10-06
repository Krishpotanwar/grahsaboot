import { idbAll, idbDelete, idbGet, idbPut, openDb } from '../lib/idb.ts'
import type { Investigation } from './investigation.ts'

export interface InvestigationStore {
  list(): Promise<Investigation[]>
  get(id: string): Promise<Investigation | undefined>
  put(inv: Investigation): Promise<void>
  remove(id: string): Promise<void>
}

const newestFirst = (a: Investigation, b: Investigation) => b.updatedAt.localeCompare(a.updatedAt)

export function memoryStore(): InvestigationStore {
  const m = new Map<string, Investigation>()
  return {
    list: async () => [...m.values()].map((i) => structuredClone(i)).sort(newestFirst),
    get: async (id) => (m.has(id) ? structuredClone(m.get(id)!) : undefined),
    put: async (inv) => {
      m.set(inv.id, structuredClone(inv))
    },
    remove: async (id) => {
      m.delete(id)
    },
  }
}

export function idbStore(name = 'gs-investigations'): InvestigationStore {
  const db = openDb(name, ['investigations'])
  return {
    list: async () => (await idbAll<Investigation>(await db, 'investigations')).sort(newestFirst),
    get: async (id) => idbGet<Investigation>(await db, 'investigations', id),
    put: async (inv) => idbPut(await db, 'investigations', inv.id, inv),
    remove: async (id) => idbDelete(await db, 'investigations', id),
  }
}

let current: InvestigationStore | null = null
export const getStore = (): InvestigationStore =>
  (current ??= typeof indexedDB === 'undefined' ? memoryStore() : idbStore())
export const setStoreForTests = (s: InvestigationStore) => {
  current = s
}
