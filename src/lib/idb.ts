const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((res, rej) => {
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })

export function openDb(name: string, stores: string[], version = 1): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(name, version)
    r.onupgradeneeded = () => {
      for (const s of stores) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s)
    }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
const store = (db: IDBDatabase, name: string, mode: IDBTransactionMode) =>
  db.transaction(name, mode).objectStore(name)
export const idbGet = <T>(db: IDBDatabase, s: string, key: string) =>
  req(store(db, s, 'readonly').get(key)) as Promise<T | undefined>
export const idbPut = (db: IDBDatabase, s: string, key: string, value: unknown) =>
  req(store(db, s, 'readwrite').put(value, key)).then(() => undefined)
export const idbDelete = (db: IDBDatabase, s: string, key: string) =>
  req(store(db, s, 'readwrite').delete(key)).then(() => undefined)
export const idbAll = <T>(db: IDBDatabase, s: string) =>
  req(store(db, s, 'readonly').getAll()) as Promise<T[]>
export const idbCount = (db: IDBDatabase, s: string) => req(store(db, s, 'readonly').count())
export const idbClear = (db: IDBDatabase, s: string) =>
  req(store(db, s, 'readwrite').clear()).then(() => undefined)
