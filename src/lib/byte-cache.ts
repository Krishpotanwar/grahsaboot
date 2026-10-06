import { idbClear, idbCount, idbGet, idbPut, openDb } from './idb.ts'

export interface ByteCache {
  get(key: string): Promise<Uint8Array | undefined>
  put(key: string, v: Uint8Array): Promise<void>
}

/** Best-effort IndexedDB cache of decoded windows. Failures never break imagery. */
export function idbByteCache(name = 'gs-bytes', max = 300): ByteCache {
  const dbp = openDb(name, ['bytes'])
  let count = -1
  return {
    async get(key) {
      try {
        return await idbGet<Uint8Array>(await dbp, 'bytes', key)
      } catch {
        return undefined
      }
    },
    async put(key, v) {
      try {
        const db = await dbp
        if (count < 0) count = await idbCount(db, 'bytes')
        // ponytail: whole-store reset at `max` entries; replace with LRU if users report re-download churn
        if (count >= max) {
          await idbClear(db, 'bytes')
          count = 0
        }
        await idbPut(db, 'bytes', key, v)
        count++
      } catch {
        /* cache is optional */
      }
    },
  }
}
