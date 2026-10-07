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
  // Opened on first use, and a failed open is forgotten so "Try again" can open it again (a rejected promise kept for the page's life would never recover).
  let db: Promise<IDBDatabase> | null = null
  const open = () =>
    (db ??= openDb(name, ['investigations']).catch((e: unknown) => {
      db = null
      throw e
    }))
  return {
    list: async () => (await idbAll<Investigation>(await open(), 'investigations')).sort(newestFirst),
    get: async (id) => idbGet<Investigation>(await open(), 'investigations', id),
    put: async (inv) => idbPut(await open(), 'investigations', inv.id, inv),
    remove: async (id) => idbDelete(await open(), 'investigations', id),
  }
}

let current: InvestigationStore | null = null
export const getStore = (): InvestigationStore =>
  (current ??= typeof indexedDB === 'undefined' ? memoryStore() : idbStore())
export const setStoreForTests = (s: InvestigationStore) => {
  current = s
}
